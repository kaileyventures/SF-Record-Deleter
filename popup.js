// ============================================
// 🔧 CONFIGURATION - Sab magic strings yahan
// ============================================
const CONFIG = {
    API_VERSION: 'v58.0',
    COOKIE_NAME: 'sid',
    VALID_ID_LENGTHS: [15, 18],
    SF_DOMAINS: ['salesforce.com', 'force.com'],
    DOMAIN_MAPPING: [
        { from: '.lightning.force.com', to: '.my.salesforce.com' },
        { from: '.visual.force.com', to: '.my.salesforce.com' },
        { from: '--c.visualforce.com', to: '.my.salesforce.com' }
    ],
    HTTP_STATUS: {
        OK: 200,
        CREATED: 201,
        NO_CONTENT: 204
    },
    SALESFORCE_ERRORS: {
        ENTITY_DELETED: 'ENTITY_IS_DELETED'
    },
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000, // milliseconds
    REQUEST_DELAY: 100, // milliseconds between requests
    BUTTON_STYLES: {
        delete: { text: 'Delete Records', class: 'btn-delete' },
        insert: { text: 'Insert Records', class: 'btn-insert' },
        update: { text: 'Update Records', class: 'btn-update' }
    }
};

// ============================================
// 🎨 UI ELEMENTS
// ============================================
const UI = {
    validScreen: null,
    invalidScreen: null,
    actionSelect: null,
    executeBtn: null,
    cancelBtn: null,
    statusDiv: null,
    objectNameInput: null,
    dataInput: null
};

// ============================================
// 🚀 GLOBAL STATE
// ============================================
let abortController = new AbortController();
let isProcessing = false;

// ============================================
// 📝 UTILITY FUNCTIONS
// ============================================

/**
 * Logging function - helps with debugging
 */
const log = (message, data = '') => {
    console.log(`[SF-Record-Deleter] ${message}`, data);
};

/**
 * Error logging
 */
const logError = (message, error = '') => {
    console.error(`[SF-Record-Deleter ERROR] ${message}`, error);
};

/**
 * Update status UI with color
 */
const updateStatus = (message, color = '#38bdf8', isError = false) => {
    UI.statusDiv.style.display = 'block';
    UI.statusDiv.innerText = message;
    UI.statusDiv.style.color = color;
    
    if (isError) {
        logError(message);
    } else {
        log(message);
    }
};

/**
 * Delay function - for rate limiting
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Promisify chrome.cookies.get
 */
const getCookie = (url, name) => {
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
const getSalesforceTab = async () => {
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
 * Normalize API domain from various Salesforce URLs
 */
const normalizeApiDomain = (url) => {
    let domain = new URL(url).origin;
    
    for (const { from, to } of CONFIG.DOMAIN_MAPPING) {
        if (domain.includes(from)) {
            return domain.replace(from, to);
        }
    }
    
    return domain;
};

/**
 * Validate object name format
 */
const validateObjectName = (name) => {
    // Allow: letters, numbers, underscore, and __c suffix
    const pattern = /^[A-Za-z_][A-Za-z0-9_]*(__c)?$/;
    
    if (!pattern.test(name)) {
        throw new Error(`Invalid Object API Name: '${name}'. Use format like 'Account' or 'Lead__c'`);
    }
    
    return name;
};

/**
 * Parse and validate delete data (IDs)
 */
const parseDeleteData = (dataRaw) => {
    const records = dataRaw
        .split(/[\n,]+/)
        .map(id => id.trim())
        .filter(id => id.length > 0);
    
    const validRecords = records.filter(id => 
        CONFIG.VALID_ID_LENGTHS.includes(id.length)
    );
    
    const invalidCount = records.length - validRecords.length;
    
    if (invalidCount > 0) {
        log(`Filtered out ${invalidCount} invalid IDs. Using ${validRecords.length} valid IDs.`);
    }
    
    return validRecords;
};

/**
 * Parse and validate insert/update data (JSON)
 */
const parseJsonData = (dataRaw) => {
    try {
        const records = JSON.parse(dataRaw);
        
        if (!Array.isArray(records)) {
            throw new Error('Data must be a JSON array');
        }
        
        if (records.length === 0) {
            throw new Error('Array is empty');
        }
        
        return records;
    } catch (error) {
        // Try to find line number where error occurred
        const lineNumber = (dataRaw.substring(0, error.index || 0).match(/\n/g) || []).length + 1;
        throw new Error(`JSON Error at line ${lineNumber}: ${error.message}`);
    }
};

/**
 * Retry fetch with exponential backoff
 */
const retryFetch = async (url, options, attempt = 1) => {
    try {
        const response = await fetch(url, {
            ...options,
            signal: abortController.signal
        });
        return response;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Operation cancelled by user');
        }
        
        if (attempt < CONFIG.RETRY_ATTEMPTS) {
            const waitTime = Math.pow(2, attempt - 1) * CONFIG.RETRY_DELAY;
            log(`Attempt ${attempt} failed. Retrying in ${waitTime}ms...`);
            await delay(waitTime);
            return retryFetch(url, options, attempt + 1);
        }
        
        throw error;
    }
};

/**
 * Handle API errors gracefully
 */
const handleApiError = (response, action, record) => {
    return response.text().then(errorText => {
        // Special case: already deleted entity
        if (action === 'delete' && errorText.includes(CONFIG.SALESFORCE_ERRORS.ENTITY_DELETED)) {
            return { success: true, message: 'Already deleted' };
        }
        
        // Try to parse Salesforce error response
        try {
            const errors = JSON.parse(errorText);
            if (Array.isArray(errors) && errors[0]?.message) {
                return { success: false, message: errors[0].message };
            }
        } catch (e) {
            // Not JSON, return as is
        }
        
        return { success: false, message: errorText || 'Unknown error' };
    });
};

/**
 * Build API endpoint
 */
const buildEndpoint = (apiDomain, objectName, action, record) => {
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
const buildRequest = (action, record) => {
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

// ============================================
// 🎯 MAIN EXECUTION LOGIC
// ============================================

/**
 * Process all records (delete, insert, or update)
 */
const processRecords = async (action, objectName, records, sessionId, apiDomain) => {
    const results = {
        successCount: 0,
        failCount: 0,
        failedRecords: [],
        cancelledAt: null
    };
    
    for (let i = 0; i < records.length; i++) {
        try {
            // Check if operation was cancelled
            if (abortController.signal.aborted) {
                results.cancelledAt = i;
                throw new Error('Operation cancelled');
            }
            
            // Update status UI
            const progress = `${action.toUpperCase()}ING ${i + 1} of ${records.length}...`;
            const stats = `✅ ${results.successCount} | ❌ ${results.failCount}`;
            updateStatus(`${progress}\n${stats}\n\nProcessing...`, '#38bdf8');
            
            // Build request
            const endpoint = buildEndpoint(apiDomain, objectName, action, records[i]);
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
            });
            
            // Check if successful
            const isSuccess = response.ok || 
                            response.status === CONFIG.HTTP_STATUS.CREATED ||
                            response.status === CONFIG.HTTP_STATUS.NO_CONTENT;
            
            if (isSuccess) {
                results.successCount++;
            } else {
                const errorInfo = await handleApiError(response, action, records[i]);
                
                if (errorInfo.success) {
                    // Special case that counts as success
                    results.successCount++;
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

/**
 * Format final result message
 */
const formatResultMessage = (action, results) => {
    let message = `✅ ${action.toUpperCase()} Complete!\n`;
    message += `✅ Success: ${results.successCount}\n`;
    message += `❌ Failed: ${results.failCount}`;
    
    if (results.cancelledAt !== null) {
        message += `\n⏸️  Cancelled at record ${results.cancelledAt + 1}`;
    }
    
    if (results.failedRecords.length > 0 && results.failedRecords.length <= 5) {
        message += '\n\nFailed records:\n';
        results.failedRecords.forEach(record => {
            message += `• Record ${record.index}: ${record.error.substring(0, 50)}...\n`;
        });
    }
    
    return message;
};

// ============================================
// 🎨 UI FUNCTIONS
// ============================================

/**
 * Update payload info badge with record count
 */
const updatePayloadInfo = () => {
    const action = UI.actionSelect?.value;
    const value = UI.dataInput?.value?.trim();
    const infoBadge = document.getElementById('payloadInfo');
    
    if (!infoBadge) return;
    
    if (!value) {
        infoBadge.textContent = 'Waiting for input...';
        return;
    }
    
    try {
        if (action === 'delete') {
            const ids = parseDeleteData(value);
            infoBadge.textContent = `${ids.length} valid ID(s) detected`;
        } else {
            const records = parseJsonData(value);
            infoBadge.textContent = `${records.length} record(s) detected in JSON`;
        }
    } catch (error) {
        infoBadge.textContent = 'Invalid format';
    }
};

/**
 * Update button UI based on action
 */
const updateButtonUI = () => {
    const action = UI.actionSelect.value;
    const config = CONFIG.BUTTON_STYLES[action];
    
    UI.executeBtn.innerText = config.text;
    UI.executeBtn.className = config.class;
};

/**
 * Initialize UI elements
 */
const initializeUI = () => {
    UI.validScreen = document.getElementById('validTabScreen');
    UI.actionSelect = document.getElementById('action');
    UI.executeBtn = document.getElementById('executeBtn');
    UI.statusDiv = document.getElementById('status');
    UI.objectNameInput = document.getElementById('objectName');
    UI.dataInput = document.getElementById('dataInput');
};

/**
 * Add cancel button dynamically
 */
const addCancelButton = () => {
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancelBtn';
    cancelBtn.textContent = '⏸️ Cancel Operation';
    cancelBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
    cancelBtn.style.marginTop = '6px';
    cancelBtn.style.display = 'none';
    
    cancelBtn.addEventListener('click', () => {
        abortController.abort();
        cancelBtn.style.display = 'none';
        updateStatus('Operation cancelled!', '#f59e0b', true);
        UI.executeBtn.disabled = false;
        isProcessing = false;
    });
    
    UI.executeBtn.parentNode.insertBefore(cancelBtn, UI.executeBtn.nextSibling);
    UI.cancelBtn = cancelBtn;
};

/**
 * Setup CSS classes for button styles
 */
const addButtonStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
        .btn-delete {
            background: linear-gradient(135deg, #ef4444, #991b1b) !important;
            box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4) !important;
        }
        .btn-insert {
            background: linear-gradient(135deg, #10b981, #059669) !important;
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4) !important;
        }
        .btn-update {
            background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
            box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4) !important;
        }
    `;
    document.head.appendChild(style);
};

// ============================================
// 🔌 EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize UI elements
    initializeUI();
    addButtonStyles();
    addCancelButton();
    
    // 2. Setup event listeners
    UI.actionSelect.addEventListener('change', () => {
        updateButtonUI();
        updatePayloadInfo();
    });
    
    UI.dataInput.addEventListener('input', updatePayloadInfo);
    UI.executeBtn.addEventListener('click', executeOperation);
    
    // 3. Initialize state/UI updates
    updateButtonUI();
    updatePayloadInfo();
    
    // Show the main panel immediately
    UI.validScreen.style.display = 'flex';
    
    log('🚀 Extension loaded and ready');
});

/**
 * Main execute operation
 */
const executeOperation = async () => {
    if (isProcessing) {
        updateStatus('⏳ Operation already in progress...', '#f59e0b', true);
        return;
    }
    
    try {
        isProcessing = true;
        abortController = new AbortController();
        UI.executeBtn.disabled = true;
        UI.cancelBtn.style.display = 'flex';
        
        // ✅ #1: Retrieve Salesforce tab for session domain
        const tab = await getSalesforceTab();
        
        // Get form data
        const action = UI.actionSelect.value;
        const objectName = validateObjectName(UI.objectNameInput.value.trim());
        const dataRaw = UI.dataInput.value.trim();
        
        if (!dataRaw) {
            throw new Error('Data Payload is required');
        }
        
        // ✅ #2: Parse and validate data
        let records = [];
        if (action === 'delete') {
            records = parseDeleteData(dataRaw);
        } else {
            records = parseJsonData(dataRaw);
        }
        
        if (records.length === 0) {
            throw new Error('No valid records found');
        }
        
        updateStatus(`🔐 Authenticating...\n${records.length} records to ${action}`, '#38bdf8');
        
        // ✅ #3: Get session cookie
        const apiDomain = normalizeApiDomain(tab.url);
        const sessionId = await getCookie(apiDomain, CONFIG.COOKIE_NAME);
        
        log(`✅ Authentication successful`);
        
        // ✅ #4: Process all records (continues on error)
        updateStatus(`🚀 Starting ${action} operation...\n0 of ${records.length}...`, '#38bdf8');
        
        const results = await processRecords(action, objectName, records, sessionId, apiDomain);
        
        // ✅ #5: Show results
        const resultMessage = formatResultMessage(action, results);
        const resultColor = results.failCount === 0 ? '#10b981' : 
                          results.successCount > 0 ? '#38bdf8' : '#ef4444';
        
        updateStatus(resultMessage, resultColor);
        
        // Success animation
        if (results.failCount === 0) {
            document.getElementById('mainLogo').classList.add('success-glow');
        }
        
        // Update input payload textarea to only show failed/remaining records
        if (results.successCount > 0 || results.cancelledAt !== null) {
            const remainingRecords = [];
            for (let i = 0; i < records.length; i++) {
                const wasCancelled = results.cancelledAt !== null && i >= results.cancelledAt;
                const isFailed = results.failedRecords.some(fr => fr.index === i + 1);
                if (wasCancelled || isFailed) {
                    remainingRecords.push(records[i]);
                }
            }
            
            if (remainingRecords.length === 0) {
                UI.dataInput.value = '';
            } else {
                if (action === 'delete') {
                    UI.dataInput.value = remainingRecords.join('\n');
                } else {
                    UI.dataInput.value = JSON.stringify(remainingRecords, null, 2);
                }
            }
            updatePayloadInfo(); // Update count badge as well
        }
        
        log(`${action} operation completed: ${results.successCount} success, ${results.failCount} failed`);
        
    } catch (error) {
        updateStatus(`❌ ${error.message}`, '#ef4444', true);
    } finally {
        UI.executeBtn.disabled = false;
        UI.cancelBtn.style.display = 'none';
        isProcessing = false;
    }
};
