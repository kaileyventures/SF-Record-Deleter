import { CONFIG } from '../config/config.js';
import { log, logError, delay } from '../utils/parsers.js';

let keyPrefixMap = null;

/**
 * Promisify chrome.cookies.get
 */
export const getCookie = (url, name) => {
    return new Promise((resolve, reject) => {
        chrome.cookies.get({ url, name }, (cookie) => {
            if (!cookie) {
                reject(new Error(`Cookie '${name}' not found. Refresh Salesforce page.`));
            } else {
                resolve(cookie.value);
            }
        });
    });
};

/**
 * Retrieve Salesforce tab for session domain
 * Priority: 1. Active tab, 2. Any Salesforce tab in the browser
 */
export const getSalesforceTab = async () => {
    // 1. Try active tab in current window
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url && CONFIG.SF_DOMAINS.some(domain => activeTab.url.includes(domain))) {
        return activeTab;
    }
    
    // 2. Try any Salesforce tab in the browser
    const allTabs = await chrome.tabs.query({});
    const sfTab = allTabs.find(tab => tab.url && CONFIG.SF_DOMAINS.some(domain => tab.url.includes(domain)));
    
    if (!sfTab) {
        throw new Error('No active Salesforce session found. Please open a Salesforce tab first.');
    }
    
    return sfTab;
};

/**
 * Fetch and build the key prefix to SObject API Name mapping
 */
export const fetchKeyPrefixMap = async (sessionId, apiDomain) => {
    if (keyPrefixMap) return keyPrefixMap;
    
    try {
        const response = await fetch(`${apiDomain}/services/data/${CONFIG.API_VERSION}/sobjects/`, {
            headers: {
                'Authorization': `Bearer ${sessionId}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            keyPrefixMap = {};
            data.sobjects.forEach(sobj => {
                if (sobj.keyPrefix) {
                    keyPrefixMap[sobj.keyPrefix] = sobj.name;
                }
            });
            log(`Loaded ${Object.keys(keyPrefixMap).length} key prefix mappings.`);
            return keyPrefixMap;
        }
    } catch (e) {
        logError('Failed to fetch key prefix map', e.message);
    }
    return null;
};

/**
 * Normalize API domain from various Salesforce URLs
 */
export const normalizeApiDomain = (url) => {
    let domain = new URL(url).origin;
    
    for (const { from, to } of CONFIG.DOMAIN_MAPPING) {
        if (domain.includes(from)) {
            return domain.replace(from, to);
        }
    }
    
    return domain;
};

/**
 * Retry fetch with exponential backoff
 */
export const retryFetch = async (url, options, abortSignal, attempt = 1) => {
    try {
        const response = await fetch(url, {
            ...options,
            signal: abortSignal
        });
        return response;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Operation cancelled');
        }
        
        if (attempt < CONFIG.RETRY_ATTEMPTS) {
            const waitTime = Math.pow(2, attempt - 1) * CONFIG.RETRY_DELAY;
            log(`Attempt ${attempt} failed. Retrying in ${waitTime}ms...`);
            await delay(waitTime);
            return retryFetch(url, options, abortSignal, attempt + 1);
        }
        
        throw error;
    }
};

export const handleApiError = (response, action, record) => {
    return response.text().then(errorText => {
        // Already deleted entity
        if (action === 'delete' && errorText.includes(CONFIG.SALESFORCE_ERRORS.ENTITY_DELETED)) {
            return { success: true, message: 'Already deleted' };
        }
        
        // Try to parse Salesforce error response
        try {
            const errors = JSON.parse(errorText);
            if (Array.isArray(errors) && errors[0]?.message) {
                let msg = errors[0].message;
                if (msg.includes('The requested resource does not exist')) {
                    msg = 'Record not found';
                }
                return { success: false, message: msg };
            }
        } catch (e) {
            // Not JSON, return as is
        }
        
        if (errorText.includes('The requested resource does not exist')) {
            return { success: false, message: 'Record not found' };
        }
        
        return { success: false, message: errorText || 'Unknown error' };
    });
};

/**
 * Build API endpoint
 */
export const buildEndpoint = (apiDomain, objectName, action, record) => {
    let endpoint = `${apiDomain}/services/data/${CONFIG.API_VERSION}/sobjects/${objectName}/`;
    
    if (action === 'delete') {
        endpoint += record;
    } else if (action === 'update') {
        endpoint += record.Id;
    }
    
    return endpoint;
};

/**
 * Build request method and body
 */
export const buildRequest = (action, record) => {
    let method = 'POST';
    let bodyData = null;
    
    if (action === 'delete') {
        method = 'DELETE';
    } else if (action === 'update') {
        method = 'PATCH';
        const dataToUpdate = { ...record };
        delete dataToUpdate.Id;
        bodyData = JSON.stringify(dataToUpdate);
    } else if (action === 'insert') {
        bodyData = JSON.stringify(record);
    }
    
    return { method, bodyData };
};

/**
 * Process all records (delete, insert, or update)
 */
export const processRecords = async (action, objectName, records, sessionId, apiDomain, abortSignal, updateStatusCallback) => {
    const results = {
        successCount: 0,
        failCount: 0,
        alreadyDeletedCount: 0,
        failedRecords: [],
        cancelledAt: null
    };
    
    for (let i = 0; i < records.length; i++) {
        try {
            // Check if operation was cancelled
            if (abortSignal && abortSignal.aborted) {
                results.cancelledAt = i;
                throw new Error('Operation cancelled');
            }
            
            // Update status UI via callback
            const progress = `${action.toUpperCase()}ING ${i + 1} of ${records.length}...`;
            let stats = `✅ ${results.successCount}`;
            if (results.alreadyDeletedCount > 0) {
                stats += ` | 🗑️ ${results.alreadyDeletedCount}`;
            }
            stats += ` | ❌ ${results.failCount}`;
            updateStatusCallback(`${progress}\n${stats}\n\nProcessing...`, '#38bdf8');
            
            // Build request
            let sObjectName = objectName;
            if (action === 'delete' && typeof records[i] === 'string' && records[i].length >= 3) {
                const prefix = records[i].substring(0, 3);
                if (keyPrefixMap && keyPrefixMap[prefix]) {
                    sObjectName = keyPrefixMap[prefix];
                    log(`Auto-resolved ID ${records[i]} to SObject: ${sObjectName}`);
                }
            }
            const endpoint = buildEndpoint(apiDomain, sObjectName, action, records[i]);
            const { method, bodyData } = buildRequest(action, records[i]);
            
            log(`[${action.toUpperCase()}] Record ${i + 1}/${records.length}: ${records[i]?.Id || records[i]}`);
            
            // Execute request with retry
            const response = await retryFetch(endpoint, {
                method,
                headers: {
                    'Authorization': `Bearer ${sessionId}`,
                    'Content-Type': 'application/json'
                },
                body: bodyData
            }, abortSignal);
            
            // Check if successful
            const isSuccess = response.ok || 
                            response.status === CONFIG.HTTP_STATUS.CREATED ||
                            response.status === CONFIG.HTTP_STATUS.NO_CONTENT;
            
            if (isSuccess) {
                results.successCount++;
            } else {
                const errorInfo = await handleApiError(response, action, records[i]);
                
                if (errorInfo.success) {
                    if (errorInfo.message === 'Already deleted') {
                        results.alreadyDeletedCount++;
                    } else {
                        results.successCount++;
                    }
                } else {
                    results.failCount++;
                    results.failedRecords.push({
                        index: i + 1,
                        id: records[i]?.Id || records[i],
                        record: records[i],
                        error: errorInfo.message,
                        status: response.status
                    });
                    
                    logError(`Record ${i + 1} failed`, errorInfo.message);
                }
            }
            
            // Rate limiting - wait between requests
            if (i < records.length - 1) {
                await delay(CONFIG.REQUEST_DELAY);
            }
            
        } catch (error) {
            if (error.message === 'Operation cancelled') {
                logError('Operation was cancelled by user');
                break;
            }
            
            results.failCount++;
            results.failedRecords.push({
                index: i + 1,
                id: records[i]?.Id || records[i],
                record: records[i],
                error: error.message
            });
            
            logError(`Record ${i + 1} error`, error.message);
            
            // Continue to next record instead of stopping
            await delay(CONFIG.REQUEST_DELAY);
        }
    }
    
    return results;
};
