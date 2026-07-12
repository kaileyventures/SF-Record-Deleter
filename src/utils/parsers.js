import { CONFIG } from '../config/config.js';

/**
 * Logging function - helps with debugging
 */
export const log = (message, data = '') => {
    console.log(`[SF-Record-Deleter] ${message}`, data);
};

export const logError = (message, error = '') => {
    console.log(`%c[SF-Record-Deleter ERROR] ${message}`, 'color: #ef4444; font-weight: bold;', error);
};

/**
 * Delay function - for rate limiting
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Validate object name format
 */
export const validateObjectName = (name) => {
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
export const parseDeleteData = (dataRaw) => {
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
export const parseJsonData = (dataRaw) => {
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
