/**
 * Web Worker for Gemini Icon Remover Inpainting
 * Offloads heavy image processing from the main thread
 */

// Import the inpainting algorithm
importScripts('inpainter.js');

const inpainter = new Inpainter();

self.onmessage = function (e) {
    const { action, imageData, mask } = e.data;

    if (action === 'inpaint') {
        const progressCallback = (progress) => {
            self.postMessage({ type: 'progress', progress });
        };

        const result = inpainter.inpaint(imageData, mask, progressCallback);

        self.postMessage({
            type: 'complete',
            result: result
        });
    }
};
