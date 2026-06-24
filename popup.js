document.addEventListener('DOMContentLoaded', async () => {
    const validScreen = document.getElementById('validTabScreen');
    const invalidScreen = document.getElementById('invalidTabScreen');
    const actionSelect = document.getElementById('action');
    const executeBtn = document.getElementById('executeBtn');
    
    // Dynamic Button UI Logic
    const updateButtonUI = () => {
        const action = actionSelect.value;
        if (action === 'delete') {
            executeBtn.innerText = "Delete Records";
            executeBtn.style.background = "linear-gradient(135deg, #ef4444, #991b1b)";
            executeBtn.style.boxShadow = "0 4px 15px rgba(239, 68, 68, 0.4)";
        } else if (action === 'insert') {
            executeBtn.innerText = "Insert Records";
            executeBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
            executeBtn.style.boxShadow = "0 4px 15px rgba(16, 185, 129, 0.4)";
        } else {
            executeBtn.innerText = "Update Records";
            executeBtn.style.background = "linear-gradient(135deg, #3b82f6, #2563eb)";
            executeBtn.style.boxShadow = "0 4px 15px rgba(59, 130, 246, 0.4)";
        }
    };

    actionSelect.addEventListener('change', updateButtonUI);
    updateButtonUI(); // Set initial state

    // Check Active Tab Environment
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isSalesforce = tab && tab.url && (tab.url.includes('salesforce.com') || tab.url.includes('force.com'));

    if (isSalesforce) {
        validScreen.style.display = 'flex';
    } else {
        invalidScreen.style.display = 'flex';
    }

    // Global Tab Navigation
    document.getElementById('findSfBtn').addEventListener('click', async () => {
        let allTabs = await chrome.tabs.query({}); 
        let sfTab = allTabs.find(t => t.url && (t.url.includes('salesforce.com') || t.url.includes('force.com')));
        
        if (sfTab) {
            await chrome.windows.update(sfTab.windowId, { focused: true });
            await chrome.tabs.update(sfTab.id, { active: true });
        } else {
            chrome.tabs.create({ url: "https://login.salesforce.com" });
        }
    });

    // Core Execution Logic
    executeBtn.addEventListener('click', async () => {
        const action = actionSelect.value;
        const objectName = document.getElementById('objectName').value.trim();
        const dataRaw = document.getElementById('dataInput').value.trim();
        const statusDiv = document.getElementById('status');
        
        statusDiv.style.display = 'block';
        statusDiv.innerText = "";
        statusDiv.style.color = "";

        if (!objectName || !dataRaw) {
            statusDiv.innerText = "Error: Object Name and Data required.";
            statusDiv.style.color = "#ef4444";
            return;
        }

        let records = [];
        if (action === 'delete') {
            records = dataRaw.split(/[\n,]+/).map(id => id.trim()).filter(id => id.length === 18 || id.length === 15);
        } else {
            try {
                records = JSON.parse(dataRaw);
                if (!Array.isArray(records)) throw new Error("Not an array");
            } catch (e) {
                statusDiv.innerText = "Error: Invalid JSON format.";
                statusDiv.style.color = "#ef4444";
                return;
            }
        }

        if (records.length === 0) {
            statusDiv.innerText = "Error: No valid data found.";
            statusDiv.style.color = "#ef4444";
            return;
        }

        executeBtn.disabled = true;
        statusDiv.innerText = "Authenticating...";
        statusDiv.style.color = "#38bdf8";

        let sfDomain = new URL(tab.url).origin;
        let apiDomain = sfDomain;

        if (sfDomain.includes('.lightning.force.com')) {
            apiDomain = sfDomain.replace('.lightning.force.com', '.my.salesforce.com');
        }

        chrome.cookies.get({ url: apiDomain, name: "sid" }, async function(cookie) {
            if (!cookie) {
                statusDiv.innerText = `Error: Session ID missing. Refresh SF page.`;
                statusDiv.style.color = "#ef4444";
                executeBtn.disabled = false;
                return;
            }

            const sessionId = cookie.value;
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < records.length; i++) {
                statusDiv.innerText = `${action.toUpperCase()}ING ${i + 1} of ${records.length}...\nSuccess: ${successCount} | Failed: ${failCount}`;
                
                let endpoint = `${apiDomain}/services/data/v58.0/sobjects/${objectName}/`;
                let method = 'POST';
                let bodyData = null;

                if (action === 'delete') {
                    endpoint += records[i];
                    method = 'DELETE';
                } else if (action === 'update') {
                    if (!records[i].Id) { failCount++; continue; }
                    endpoint += records[i].Id;
                    method = 'PATCH';
                    let dataToUpdate = { ...records[i] };
                    delete dataToUpdate.Id;
                    bodyData = JSON.stringify(dataToUpdate);
                } else if (action === 'insert') {
                    method = 'POST';
                    bodyData = JSON.stringify(records[i]);
                }

                try {
                    const response = await fetch(endpoint, {
                        method: method,
                        headers: { 'Authorization': `Bearer ${sessionId}`, 'Content-Type': 'application/json' },
                        body: bodyData
                    });

                    if (response.ok || response.status === 201 || response.status === 204) {
                        successCount++;
                    } else {
                        const errorResponse = await response.text();
                        if (action === 'delete' && errorResponse.includes('ENTITY_IS_DELETED')) {
                            successCount++; 
                            continue;
                        }
                        failCount++;
                        statusDiv.innerText = `FAILED at ID: ${records[i] || 'Record ' + (i+1)}\nError: ${errorResponse}`;
                        statusDiv.style.color = "#ef4444";
                        executeBtn.disabled = false;
                        return; 
                    }
                } catch (error) {
                    failCount++;
                    statusDiv.innerText = `Network Error: ${error.message}`;
                    statusDiv.style.color = "#ef4444";
                    executeBtn.disabled = false;
                    return;
                }
            }
            
            statusDiv.innerText = `Process Complete.\nSuccess: ${successCount} | Failed: ${failCount}`;
            statusDiv.style.color = failCount > 0 ? "#ef4444" : "#10b981";
            executeBtn.disabled = false;
        });
    });
});
