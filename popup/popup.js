// popup/popup.js
let proxyRunning = false;

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

async function checkServices() {
    console.log('Checking services...');
    try {
        // Check Ollama
        const ollamaStatus = document.getElementById('ollamaStatus');
        try {
            const response = await fetch('http://localhost:11434/api/version');
            if (response.ok) {
                ollamaStatus.textContent = 'Running';
                ollamaStatus.className = 'status running';
            } else {
                throw new Error('Not running');
            }
        } catch {
            ollamaStatus.textContent = 'Not Running';
            ollamaStatus.className = 'status stopped';
        }

        // Check Proxy status from background script
        const proxyStatus = document.getElementById('proxyStatus');
        const response = await chrome.runtime.sendMessage({ action: 'getProxyStatus' });
        proxyRunning = response.isRunning;
        proxyStatus.textContent = proxyRunning ? 'Running' : 'Not Running';
        proxyStatus.className = proxyRunning ? 'status running' : 'status stopped';
        updateProxyButton();
    } catch (error) {
        console.error('Error checking services:', error);
    }
}

function updateProxyButton() {
    const button = document.getElementById('toggleProxy');
    if (proxyRunning) {
        button.textContent = 'Stop Proxy';
        button.className = 'button stop';
    } else {
        button.textContent = 'Start Proxy';
        button.className = 'button start';
    }
}

document.getElementById('toggleProxy').addEventListener('click', async () => {
    const button = document.getElementById('toggleProxy');
    button.disabled = true;
    
    try {
        console.log('Toggle proxy button clicked, current state:', proxyRunning);
        const action = proxyRunning ? 'stopProxy' : 'startProxy';
        
        console.log('Sending message to background script:', action);
        const response = await chrome.runtime.sendMessage({ action });
        console.log('Received response:', response);
        
        if (response.error) {
            throw new Error(response.error);
        }
        
        await checkServices();
    } catch (error) {
        console.error('Error toggling proxy:', error);
        showError(error.message || 'Failed to toggle proxy server');
    } finally {
        button.disabled = false;
    }
});

// Check services status every 5 seconds
setInterval(checkServices, 5000);

// Initial check
document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup loaded, performing initial service check');
    checkServices();
});
