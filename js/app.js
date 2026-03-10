/**
 * Gemini Icon Remover - Main Application
 * 
 * A client-side web application for removing Gemini AI watermarks from images.
 * Uses HTML5 Canvas API and custom inpainting algorithms.
 */

class GeminiIconRemover {
    constructor() {
        // Canvas elements
        this.mainCanvas = document.getElementById('main-canvas');
        this.overlayCanvas = document.getElementById('overlay-canvas');
        this.processingCanvas = document.getElementById('processing-canvas');
        
        this.mainCtx = this.mainCanvas.getContext('2d');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.processingCtx = this.processingCanvas.getContext('2d');
        
        // State
        this.originalImage = null;
        this.currentImageData = null;
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 10;
        
        // Mode
        this.mode = 'auto'; // 'auto' or 'manual'
        this.isDrawing = false;
        this.brushSize = 30;
        this.manualMask = null;
        
        // Inpainter instance
        this.inpainter = new Inpainter();
        
        // Initialize
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.bindEvents();
        this.updateUI();
    }

    /**
     * Bind all event listeners
     */
    bindEvents() {
        // File upload
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        
        // Mode buttons
        document.getElementById('mode-auto').addEventListener('click', () => this.setMode('auto'));
        document.getElementById('mode-manual').addEventListener('click', () => this.setMode('manual'));
        
        // Brush size
        const brushSizeInput = document.getElementById('brush-size');
        brushSizeInput.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            document.getElementById('brush-size-value').textContent = `${this.brushSize}px`;
        });
        
        // Canvas interactions for manual mode
        this.overlayCanvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.overlayCanvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.overlayCanvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.overlayCanvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
        
        // Touch events for mobile
        this.overlayCanvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.overlayCanvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.overlayCanvas.addEventListener('touchend', this.handleMouseUp.bind(this));
        
        // Action buttons
        document.getElementById('process-btn').addEventListener('click', this.processImage.bind(this));
        document.getElementById('download-btn').addEventListener('click', this.downloadImage.bind(this));
        document.getElementById('undo-btn').addEventListener('click', this.undo.bind(this));
        document.getElementById('redo-btn').addEventListener('click', this.redo.bind(this));
        document.getElementById('reset-btn').addEventListener('click', this.resetImage.bind(this));
        document.getElementById('new-image-btn').addEventListener('click', this.newImage.bind(this));
    }

    /**
     * Handle drag over event
     */
    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    /**
     * Handle drag leave event
     */
    handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    /**
     * Handle drop event
     */
    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.loadImage(files[0]);
        }
    }

    /**
     * Handle file selection
     */
    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.loadImage(files[0]);
        }
    }

    /**
     * Load and display an image
     */
    loadImage(file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }
        
        // Check file size (max 20MB)
        if (file.size > 20 * 1024 * 1024) {
            alert('File size must be less than 20MB');
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                this.originalImage = img;
                
                // Resize if too large (max 2048x2048)
                let width = img.width;
                let height = img.height;
                const maxSize = 2048;
                
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }
                
                // Set canvas sizes
                this.mainCanvas.width = width;
                this.mainCanvas.height = height;
                this.overlayCanvas.width = width;
                this.overlayCanvas.height = height;
                this.processingCanvas.width = width;
                this.processingCanvas.height = height;
                
                // Draw image
                this.mainCtx.drawImage(img, 0, 0, width, height);
                this.currentImageData = this.mainCtx.getImageData(0, 0, width, height);
                
                // Initialize manual mask
                this.manualMask = new Uint8Array(width * height);
                
                // Clear history
                this.history = [];
                this.historyIndex = -1;
                this.saveState();
                
                // Show editor
                document.getElementById('upload-section').classList.add('hidden');
                document.getElementById('editor-section').classList.remove('hidden');
                
                this.updateUI();
            };
            
            img.onerror = () => {
                alert('Failed to load image');
            };
            
            img.src = e.target.result;
        };
        
        reader.readAsDataURL(file);
    }

    /**
     * Set the current mode (auto or manual)
     */
    setMode(mode) {
        this.mode = mode;
        
        // Update button states
        document.getElementById('mode-auto').classList.toggle('active', mode === 'auto');
        document.getElementById('mode-manual').classList.toggle('active', mode === 'manual');
        
        // Show/hide manual controls
        document.getElementById('manual-controls').classList.toggle('hidden', mode !== 'manual');
        
        // Update canvas cursor
        document.querySelector('.canvas-wrapper').classList.toggle('manual-mode', mode === 'manual');
        
        // Update instructions
        const instructionText = document.getElementById('instruction-text');
        if (mode === 'auto') {
            instructionText.textContent = 'Click "Remove Icon" to auto-detect and remove the Gemini watermark';
        } else {
            instructionText.textContent = 'Draw on the image to mark areas to remove, then click "Remove Icon"';
        }
        
        // Clear overlay in auto mode
        if (mode === 'auto') {
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }
    }

    /**
     * Get mouse position relative to canvas
     */
    getMousePos(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        const scaleX = this.overlayCanvas.width / rect.width;
        const scaleY = this.overlayCanvas.height / rect.height;
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
        e.preventDefault();
        if (this.mode !== 'manual') return;
        
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseDown(mouseEvent);
    }

    /**
     * Handle touch move
     */
    handleTouchMove(e) {
        e.preventDefault();
        if (this.mode !== 'manual') return;
        
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.handleMouseMove(mouseEvent);
    }

    /**
     * Handle mouse down on canvas
     */
    handleMouseDown(e) {
        if (this.mode !== 'manual') return;
        
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        this.drawBrush(pos.x, pos.y);
    }

    /**
     * Handle mouse move on canvas
     */
    handleMouseMove(e) {
        if (!this.isDrawing || this.mode !== 'manual') return;
        
        const pos = this.getMousePos(e);
        this.drawBrush(pos.x, pos.y);
    }

    /**
     * Handle mouse up
     */
    handleMouseUp() {
        this.isDrawing = false;
    }

    /**
     * Draw brush stroke on overlay and update mask
     */
    drawBrush(x, y) {
        const radius = this.brushSize / 2;
        
        // Draw on overlay canvas
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(x, y, radius, 0, Math.PI * 2);
        this.overlayCtx.fillStyle = 'rgba(88, 166, 255, 0.5)';
        this.overlayCtx.fill();
        this.overlayCtx.strokeStyle = 'rgba(88, 166, 255, 0.8)';
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.stroke();
        
        // Update mask
        const width = this.mainCanvas.width;
        const height = this.mainCanvas.height;
        
        for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++) {
            for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++) {
                const px = Math.floor(x + dx);
                const py = Math.floor(y + dy);
                
                if (px >= 0 && px < width && py >= 0 && py < height) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= radius) {
                        this.manualMask[py * width + px] = 255;
                    }
                }
            }
        }
    }

    /**
     * Process the image (remove watermark)
     */
    async processImage() {
        if (!this.currentImageData) return;
        
        this.showProgress('Detecting watermark...');
        
        // Small delay to allow UI update
        await new Promise(resolve => setTimeout(resolve, 50));
        
        let mask;
        
        if (this.mode === 'auto') {
            // Auto-detect watermark regions
            const regions = Inpainter.detectWatermarkRegions(this.currentImageData);
            
            if (regions.length === 0 || regions[0].confidence < 0.3) {
                this.hideProgress();
                alert('Could not auto-detect watermark. Please switch to manual mode and mark the area to remove.');
                return;
            }
            
            // Use the highest confidence region
            const region = regions[0];
            
            // Create mask for the detected region
            mask = new Uint8Array(this.currentImageData.width * this.currentImageData.height);
            
            // Expand the region slightly
            const padding = 10;
            const x = Math.max(0, region.x - padding);
            const y = Math.max(0, region.y - padding);
            const w = Math.min(this.currentImageData.width - x, region.width + padding * 2);
            const h = Math.min(this.currentImageData.height - y, region.height + padding * 2);
            
            for (let py = y; py < y + h; py++) {
                for (let px = x; px < x + w; px++) {
                    mask[py * this.currentImageData.width + px] = 255;
                }
            }
        } else {
            // Use manual mask
            mask = this.manualMask;
            
            // Check if any pixels are marked
            if (!mask.some(v => v === 255)) {
                this.hideProgress();
                alert('Please mark the area to remove by drawing on the image.');
                return;
            }
        }
        
        this.showProgress('Removing watermark...');
        
        // Perform inpainting
        const progressCallback = (progress) => {
            this.updateProgressText(`Removing watermark... ${Math.round(progress * 100)}%`);
        };
        
        // Use quick inpaint for small regions, full inpaint for larger ones
        const maskSize = mask.filter(v => v === 255).length;
        const totalSize = mask.length;
        
        let result;
        if (maskSize / totalSize < 0.05) {
            // Small region - use quick inpaint
            result = this.inpainter.quickInpaint(this.currentImageData, mask, 200);
        } else {
            // Larger region - use full inpaint
            result = this.inpainter.inpaint(this.currentImageData, mask, progressCallback);
        }
        
        // Update canvas with result
        this.mainCtx.putImageData(result, 0, 0);
        this.currentImageData = result;
        
        // Save state
        this.saveState();
        
        // Clear overlay and mask
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        this.manualMask = new Uint8Array(this.mainCanvas.width * this.mainCanvas.height);
        
        this.hideProgress();
        
        // Show download button
        document.getElementById('download-btn').classList.remove('hidden');
        
        // Update instructions
        document.getElementById('instruction-text').textContent = 'Watermark removed! Click Download to save your image.';
    }

    /**
     * Show progress overlay
     */
    showProgress(text) {
        const overlay = document.getElementById('progress-overlay');
        const textEl = document.getElementById('progress-text');
        
        textEl.textContent = text;
        overlay.classList.remove('hidden');
        document.querySelector('.canvas-wrapper').classList.add('processing');
    }

    /**
     * Update progress text
     */
    updateProgressText(text) {
        document.getElementById('progress-text').textContent = text;
    }

    /**
     * Hide progress overlay
     */
    hideProgress() {
        document.getElementById('progress-overlay').classList.add('hidden');
        document.querySelector('.canvas-wrapper').classList.remove('processing');
    }

    /**
     * Save current state to history
     */
    saveState() {
        // Remove any redo states
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        // Add new state
        this.history.push(this.mainCtx.getImageData(0, 0, this.mainCanvas.width, this.mainCanvas.height));
        
        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
        
        this.updateUI();
    }

    /**
     * Undo last action
     */
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const state = this.history[this.historyIndex];
            this.mainCanvas.width = state.width;
            this.mainCanvas.height = state.height;
            this.overlayCanvas.width = state.width;
            this.overlayCanvas.height = state.height;
            this.mainCtx.putImageData(state, 0, 0);
            this.currentImageData = state;
            this.updateUI();
        }
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const state = this.history[this.historyIndex];
            this.mainCanvas.width = state.width;
            this.mainCanvas.height = state.height;
            this.overlayCanvas.width = state.width;
            this.overlayCanvas.height = state.height;
            this.mainCtx.putImageData(state, 0, 0);
            this.currentImageData = state;
            this.updateUI();
        }
    }

    /**
     * Reset image to original
     */
    resetImage() {
        if (!this.originalImage) return;
        
        if (confirm('Reset image to original?')) {
            this.mainCtx.drawImage(this.originalImage, 0, 0, this.mainCanvas.width, this.mainCanvas.height);
            this.currentImageData = this.mainCtx.getImageData(0, 0, this.mainCanvas.width, this.mainCanvas.height);
            
            // Clear overlay and mask
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            this.manualMask = new Uint8Array(this.mainCanvas.width * this.mainCanvas.height);
            
            // Reset history
            this.history = [];
            this.historyIndex = -1;
            this.saveState();
            
            // Hide download button
            document.getElementById('download-btn').classList.add('hidden');
            
            // Reset instructions
            const instructionText = document.getElementById('instruction-text');
            if (this.mode === 'auto') {
                instructionText.textContent = 'Click "Remove Icon" to auto-detect and remove the Gemini watermark';
            } else {
                instructionText.textContent = 'Draw on the image to mark areas to remove, then click "Remove Icon"';
            }
            
            this.updateUI();
        }
    }

    /**
     * Upload a new image
     */
    newImage() {
        if (confirm('Upload a new image? Current progress will be lost.')) {
            document.getElementById('editor-section').classList.add('hidden');
            document.getElementById('upload-section').classList.remove('hidden');
            document.getElementById('file-input').value = '';
            
            this.originalImage = null;
            this.currentImageData = null;
            this.history = [];
            this.historyIndex = -1;
            this.manualMask = null;
            
            this.updateUI();
        }
    }

    /**
     * Download the processed image
     */
    downloadImage() {
        if (!this.currentImageData) return;
        
        // Create download link
        const link = document.createElement('a');
        link.download = 'image-no-watermark.png';
        link.href = this.mainCanvas.toDataURL('image/png');
        link.click();
    }

    /**
     * Update UI state (enable/disable buttons)
     */
    updateUI() {
        document.getElementById('undo-btn').disabled = this.historyIndex <= 0;
        document.getElementById('redo-btn').disabled = this.historyIndex >= this.history.length - 1;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GeminiIconRemover();
});
