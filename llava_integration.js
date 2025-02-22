// llava_integration.js

/**
 * Integrates with the LLaVa AI model via Ollama to generate descriptive filenames for images.
 */

/**
 * Sends the image URL to the background script for processing with Ollama.
 * @param {string} imageUrl - The URL of the image to analyze.
 * @returns {Promise<string>} - A promise that resolves to the generated filename.
 */
export async function getFilenameFromImage(imageUrl) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { action: 'analyzeImage', imageUrl: imageUrl },
            response => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.filename);
                }
            }
        );
    });
}

/**
 * Check Ollama status
 * @returns {Promise<{status: string, message: string}>}
 */
export async function checkOllamaStatus() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { action: 'checkOllama' },
            response => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            }
        );
    });
}
