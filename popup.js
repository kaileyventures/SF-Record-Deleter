import { CONFIG } from './src/config/config.js';
import { log, logError, validateObjectName, parseDeleteData, parseJsonData } from './src/utils/parsers.js';
import { getCookie, getSalesforceTab, fetchKeyPrefixMap, normalizeApiDomain, processRecords } from './src/api/salesforce.js';

// ============================================
// 🎨 UI ELEMENTS
// ============================================
const UI = {
    validScreen: null,
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
 * Update status UI with color
 */
const updateStatus = (message, color = '#38bdf8', isError = false, isHtml = false) => {
    UI.statusDiv.style.display = 'block';
    if (isHtml) {
        UI.statusDiv.innerHTML = message;
        UI.statusDiv.style.color = ''; // Reset container color
    } else {
        UI.statusDiv.innerText = message;
        UI.statusDiv.style.color = color;
    }
    
    if (isError) {
        logError(message);
    } else {
        log(message);
    }
};

const formatResultMessage = (action, results) => {
    let html = `${action.toUpperCase()} - `;
    html += `<span style="color: #10b981; font-weight: 600;">Success: ${results.successCount}</span>`;
    
    if (results.alreadyDeletedCount > 0 || action === 'delete') {
        html += ` | <span style="color: #f59e0b; font-weight: 600;">Already Deleted: ${results.alreadyDeletedCount}</span>`;
    }
    
    html += ` | <span style="color: #ef4444; font-weight: 600;">Failed: ${results.failCount}</span>`;
    
    if (results.cancelledAt !== null) {
        html += ` <span style="color: #f59e0b;">(Cancelled at #${results.cancelledAt + 1})</span>`;
    }
    
    if (results.failedRecords.length > 0) {
        html += '<div style="margin-top: 6px; text-align: left; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">Errors:<br>';
        results.failedRecords.slice(0, 3).forEach(record => {
            html += `<span style="color: #f87171;">• #${record.index}: ${record.error.substring(0, 45)}</span><br>`;
        });
        if (results.failedRecords.length > 3) {
            html += `<span style="color: #94a3b8;">• ...and ${results.failedRecords.length - 3} more errors</span>`;
        }
        html += '</div>';
    }
    
    return html;
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
    UI.cancelBtn = document.getElementById('cancelBtn');
    UI.statusDiv = document.getElementById('status');
    UI.objectNameInput = document.getElementById('objectName');
    UI.dataInput = document.getElementById('dataInput');
};

// ============================================
// 🔌 EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize UI elements
    initializeUI();
    
    // 2. Setup event listeners
    UI.actionSelect.addEventListener('change', () => {
        updateButtonUI();
        updatePayloadInfo();
    });
    
    UI.dataInput.addEventListener('input', updatePayloadInfo);
    UI.executeBtn.addEventListener('click', executeOperation);
    
    UI.cancelBtn.addEventListener('click', () => {
        abortController.abort();
        UI.cancelBtn.style.display = 'none';
        updateStatus('Operation cancelled!', '#f59e0b', true);
        UI.executeBtn.disabled = false;
        isProcessing = false;
    });
    
    // Add keydown listeners for shortcuts
    UI.objectNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeOperation();
        }
    });
    
    UI.dataInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            executeOperation();
        }
    });
    
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
        
        // Fetch key prefixes mapping to automatically resolve correct Object API Names for IDs
        if (action === 'delete') {
            updateStatus(`🔐 Authenticating...\nResolving Salesforce object metadata...`, '#38bdf8');
            await fetchKeyPrefixMap(sessionId, apiDomain);
        }
        
        // ✅ #4: Process all records (continues on error)
        updateStatus(`🚀 Starting ${action} operation...\n0 of ${records.length}...`, '#38bdf8');
        
        const results = await processRecords(action, objectName, records, sessionId, apiDomain, abortController.signal, updateStatus);
        
        const resultMessage = formatResultMessage(action, results);
        updateStatus(resultMessage, '', false, true);
        
        // Success animation
        if (results.failCount === 0) {
            document.getElementById('mainLogo').classList.add('success-glow');
        }
        
        // Update input payload textarea to only show failed/remaining records
        if (results.successCount > 0 || results.alreadyDeletedCount > 0 || results.cancelledAt !== null) {
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
