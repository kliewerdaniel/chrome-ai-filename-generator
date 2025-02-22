import { getFilenameFromImage } from './llava_integration.js';

/**
 * Analyzes an image URL to generate a descriptive filename using AI.
 * @param {string} imageUrl - The URL of the image to analyze.
 * @returns {Promise<string>} - The generated filename.
 */
export async function analyzeImage(imageUrl) {
    return await getFilenameFromImage(imageUrl);
}
