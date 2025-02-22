// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchImage') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        // Create a promise to handle image loading
        const imageLoadPromise = new Promise((resolve, reject) => {
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    
                    const base64Data = canvas.toDataURL('image/jpeg').split(',')[1];
                    resolve(base64Data);
                } catch (error) {
                    reject(new Error('Failed to convert image to base64: ' + error.message));
                } finally {
                    canvas.remove();
                }
            };
            
            img.onerror = () => {
                reject(new Error('Failed to load image: ' + request.url));
            };
        });

        // Set image source after setting up handlers
        img.src = request.url;

        // Handle the promise
        imageLoadPromise
            .then(base64Data => {
                sendResponse({ success: true, data: base64Data });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            })
            .finally(() => {
                img.remove();
            });

        return true; // Keep message channel open for async response
    }
});
