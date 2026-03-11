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
        this.mode = 'auto'; // 'auto', 'manual', or 'wand'
        this.isDrawing = false;
        this.brushSize = 30;
        this.wandTolerance = 30;
        this.manualMask = null;

        // Zoom & Pan State
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;
        this.startPanX = 0;
        this.startPanY = 0;

        // Slider State
        this.isSliding = false;

        // Inpainter instance
        this.inpainter = new Inpainter();

        // Web Worker for background processing
        this.worker = new Worker('js/worker.js');
        this.worker.onmessage = this.handleWorkerMessage.bind(this);

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
        document.getElementById('mode-wand').addEventListener('click', () => this.setMode('wand'));

        // Brush & Wand settings
        const brushSizeInput = document.getElementById('brush-size');
        brushSizeInput.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            document.getElementById('brush-size-value').textContent = `${this.brushSize}px`;
        });

        const wandTolInput = document.getElementById('wand-tolerance');
        wandTolInput.addEventListener('input', (e) => {
            this.wandTolerance = parseInt(e.target.value);
            document.getElementById('wand-tolerance-value').textContent = this.wandTolerance;
        });

        // Zoom controls
        document.getElementById('zoom-in-btn').addEventListener('click', () => this.zoom(1.2));
        document.getElementById('zoom-out-btn').addEventListener('click', () => this.zoom(1 / 1.2));
        document.getElementById('zoom-fit-btn').addEventListener('click', () => this.fitToScreen());

        // Canvas interactions for pan/zoom
        const container = document.getElementById('canvas-container');
        container.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // Use container for mouse events to allow panning outside canvas
        container.addEventListener('mousedown', this.handleMouseDown.bind(this));
        window.addEventListener('mousemove', this.handleMouseMove.bind(this)); // window to catch rapid drags
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // Touch events for mobile
        container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        window.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        window.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Slider interactions
        const sliderHandle = document.getElementById('slider-handle');
        sliderHandle.addEventListener('mousedown', (e) => {
            this.isSliding = true;
            e.stopPropagation();
        });
        sliderHandle.addEventListener('touchstart', (e) => {
            this.isSliding = true;
            e.stopPropagation();
        });

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

                const beforeCanvas = document.getElementById('before-canvas');
                beforeCanvas.width = width;
                beforeCanvas.height = height;

                // Draw image
                this.mainCtx.drawImage(img, 0, 0, width, height);
                this.currentImageData = this.mainCtx.getImageData(0, 0, width, height);

                // Hide slider
                beforeCanvas.classList.add('hidden');
                document.getElementById('slider-handle').classList.add('hidden');

                // Reset Zoom
                this.fitToScreen();

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
     * Set the current mode (auto, manual, or wand)
     */
    setMode(mode) {
        this.mode = mode;

        // Update button states
        document.getElementById('mode-auto').classList.toggle('active', mode === 'auto');
        document.getElementById('mode-manual').classList.toggle('active', mode === 'manual');
        document.getElementById('mode-wand').classList.toggle('active', mode === 'wand');

        // Show/hide manual/wand controls
        document.getElementById('manual-controls').classList.toggle('hidden', mode !== 'manual');
        document.getElementById('wand-controls').classList.toggle('hidden', mode !== 'wand');

        // Update canvas cursor
        const container = document.getElementById('canvas-container');
        container.classList.toggle('manual-mode', mode === 'manual');
        container.classList.toggle('wand-mode', mode === 'wand');

        // Update instructions
        const instructionText = document.getElementById('instruction-text');
        if (mode === 'auto') {
            instructionText.textContent = 'Click "Remove Icon" to auto-detect and remove the Gemini watermark';
        } else if (mode === 'wand') {
            instructionText.textContent = 'Click on the watermark to auto-select surrounding pixels of similar color';
        } else {
            instructionText.textContent = 'Draw on the image to mark areas to remove, then click "Remove Icon"';
        }

        // Clear overlay in auto mode
        if (mode === 'auto') {
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            if (this.manualMask) {
                this.manualMask.fill(0);
            }
        }
    }

    /**
     * Zoom functionality
     */
    zoom(factor, mouseX = null, mouseY = null) {
        if (!this.currentImageData) return;

        let targetScale = this.scale * factor;
        targetScale = Math.max(0.1, Math.min(targetScale, 10)); // Min 0.1x, max 10x

        if (targetScale === this.scale) return;

        if (mouseX !== null && mouseY !== null) {
            // Zoom towards mouse pointer
            const rect = document.getElementById('canvas-container').getBoundingClientRect();
            const relX = mouseX - rect.left;
            const relY = mouseY - rect.top;

            this.offsetX = relX - (relX - this.offsetX) * (targetScale / this.scale);
            this.offsetY = relY - (relY - this.offsetY) * (targetScale / this.scale);
        } else {
            // Zoom to center
            const container = document.getElementById('canvas-container');
            const cw = container.clientWidth / 2;
            const ch = container.clientHeight / 2;

            this.offsetX = cw - (cw - this.offsetX) * (targetScale / this.scale);
            this.offsetY = ch - (ch - this.offsetY) * (targetScale / this.scale);
        }

        this.scale = targetScale;
        this.updateTransform();
    }

    fitToScreen() {
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.updateTransform();
    }

    updateTransform() {
        const wrapper = document.getElementById('canvas-wrapper');
        wrapper.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    }

    handleWheel(e) {
        if (!this.currentImageData) return;
        e.preventDefault();

        const zoomSpeed = 0.001;
        const factor = 1 - (e.deltaY * zoomSpeed);
        this.zoom(factor, e.clientX, e.clientY);
    }

    /**
     * Get mouse position relative to canvas (accounting for zoom/pan)
     */
    getMousePos(e) {
        const rect = this.mainCanvas.getBoundingClientRect();

        const scaleX = this.mainCanvas.width / rect.width;
        const scaleY = this.mainCanvas.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
        if (!this.currentImageData) return;

        // Prevent default scrolling unless touching a button/slider
        if (e.target.closest('.toolbar') || e.target.closest('.action-bar') || e.target.closest('.slider-handle')) return;
        e.preventDefault();

        if (e.touches.length === 2) {
            // Initialize pinch/two-finger pan
            this.isDrawing = false;
            this.isPanning = true;
            this.startPanX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - this.offsetX;
            this.startPanY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - this.offsetY;

            this.initialPinchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            this.initialPinchScale = this.scale;
        } else if (e.touches.length === 1) {
            if (this.mode === 'manual' || this.mode === 'wand') {
                const touch = e.touches[0];
                const pseudoEvent = { clientX: touch.clientX, clientY: touch.clientY, button: 0 };
                this.handleMouseDown(pseudoEvent);
            } else {
                // One finger pan in auto mode
                this.isPanning = true;
                this.startPanX = e.touches[0].clientX - this.offsetX;
                this.startPanY = e.touches[0].clientY - this.offsetY;
            }
        }
    }

    handleTouchMove(e) {
        if (!this.currentImageData || this.isSliding) return;

        if (e.touches.length === 2 && this.isPanning) {
            e.preventDefault();
            // Handle Pan
            const centerClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerClientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            this.offsetX = centerClientX - this.startPanX;
            this.offsetY = centerClientY - this.startPanY;

            // Handle Zoom
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );

            if (this.initialPinchDistance > 0) {
                const newScale = this.initialPinchScale * (currentDistance / this.initialPinchDistance);
                const boundedScale = Math.max(0.1, Math.min(newScale, 10));

                // Adjust offsets so we zoom in on the center of the pinch
                const container = document.getElementById('canvas-container').getBoundingClientRect();
                const relX = centerClientX - container.left;
                const relY = centerClientY - container.top;

                this.offsetX = relX - (relX - this.offsetX) * (boundedScale / this.scale);
                this.offsetY = relY - (relY - this.offsetY) * (boundedScale / this.scale);

                this.scale = boundedScale;
            }
            this.updateTransform();
        } else if (e.touches.length === 1) {
            if (this.isDrawing) {
                e.preventDefault();
                const touch = e.touches[0];
                const pseudoEvent = { clientX: touch.clientX, clientY: touch.clientY };
                this.handleMouseMove(pseudoEvent);
            } else if (this.isPanning) {
                e.preventDefault();
                this.offsetX = e.touches[0].clientX - this.startPanX;
                this.offsetY = e.touches[0].clientY - this.startPanY;
                this.updateTransform();
            }
        }
    }

    handleTouchEnd(e) {
        this.isPanning = false;
        if (this.isDrawing) {
            this.handleMouseUp();
        }
    }

    /**
     * Handle mouse down
     */
    handleMouseDown(e) {
        if (!this.currentImageData) return;

        if (this.isSliding) return;

        // Middle click or Spacebar+Click or Mode isn't manual/wand = Pan
        if (e.button === 1 || (this.mode === 'auto' && e.button === 0)) {
            this.isPanning = true;
            this.startPanX = e.clientX - this.offsetX;
            this.startPanY = e.clientY - this.offsetY;
            document.body.style.cursor = 'grabbing';
            return;
        }

        if (e.button !== 0) return; // Only process left click for tools

        if (this.mode === 'manual' || this.mode === 'wand') {
            const pos = this.getMousePos(e);

            // Ignore clicks far outside the canvas bounds
            if (pos.x < -50 || pos.y < -50 || pos.x > this.mainCanvas.width + 50 || pos.y > this.mainCanvas.height + 50) return;

            if (this.mode === 'wand') {
                this.floodFill(Math.floor(pos.x), Math.floor(pos.y));
            } else {
                this.isDrawing = true;
                this.drawBrush(pos.x, pos.y);
            }
        }
    }

    /**
     * Handle mouse move
     */
    handleMouseMove(e) {
        if (this.isSliding) {
            e.preventDefault();
            this.updateSlider(e.clientX || (e.touches && e.touches[0].clientX));
            return;
        }

        if (this.isPanning) {
            this.offsetX = e.clientX - this.startPanX;
            this.offsetY = e.clientY - this.startPanY;
            this.updateTransform();
            return;
        }

        if (this.isDrawing && this.mode === 'manual') {
            const pos = this.getMousePos(e);
            this.drawBrush(pos.x, pos.y);
        }
    }

    /**
     * Handle mouse up
     */
    handleMouseUp() {
        if (this.isSliding) {
            this.isSliding = false;
        }
        if (this.isPanning) {
            this.isPanning = false;
            document.body.style.cursor = '';
        }
        if (this.isDrawing) {
            this.isDrawing = false;
        }
    }

    /**
     * Slider Logic
     */
    updateSlider(clientX) {
        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();
        let posX = clientX - rect.left;

        // Bound the slider
        posX = Math.max(0, Math.min(posX, rect.width));

        const percentage = (posX / rect.width) * 100;

        const sliderHandle = document.getElementById('slider-handle');
        sliderHandle.style.left = `${percentage}%`;

        // Use clip-path on the BEFORE canvas to reveal the Main canvas (After) underneath
        const beforeCanvas = document.getElementById('before-canvas');
        beforeCanvas.style.clipPath = `polygon(0 0, ${percentage}% 0, ${percentage}% 100%, 0 100%)`;
    }

    /**
     * Magic Wand Flood Fill
     */
    floodFill(startX, startY) {
        const width = this.mainCanvas.width;
        const height = this.mainCanvas.height;

        if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

        const data = this.currentImageData.data;
        const startIdx = (startY * width + startX) * 4;

        const targetR = data[startIdx];
        const targetG = data[startIdx + 1];
        const targetB = data[startIdx + 2];
        const tol = this.wandTolerance;

        const mask = this.manualMask;
        const stack = [[startX, startY]];
        const visited = new Uint8Array(width * height);

        this.showProgress('Selecting region...');

        // Very fast non-recursive flood fill
        requestAnimationFrame(() => {
            while (stack.length > 0) {
                const [cx, cy] = stack.pop();
                const idx = cy * width + cx;

                if (visited[idx]) continue;
                visited[idx] = 1;

                const dIdx = idx * 4;
                const r = data[dIdx];
                const g = data[dIdx + 1];
                const b = data[dIdx + 2];

                if (Math.abs(r - targetR) <= tol && Math.abs(g - targetG) <= tol && Math.abs(b - targetB) <= tol) {
                    mask[idx] = 255; // Mark as selected

                    if (cx > 0) stack.push([cx - 1, cy]);
                    if (cx < width - 1) stack.push([cx + 1, cy]);
                    if (cy > 0) stack.push([cx, cy - 1]);
                    if (cy < height - 1) stack.push([cx, cy + 1]);
                }
            }

            // Draw the selected region to the overlay canvas
            this.overlayCtx.clearRect(0, 0, width, height);

            const overlayData = this.overlayCtx.getImageData(0, 0, width, height);
            const overlayPixels = overlayData.data;

            for (let i = 0; i < mask.length; i++) {
                if (mask[i] === 255) {
                    const idx = i * 4;
                    overlayPixels[idx] = 88;     // R
                    overlayPixels[idx + 1] = 166; // G
                    overlayPixels[idx + 2] = 255; // B
                    overlayPixels[idx + 3] = 128; // A (semi-transparent)
                }
            }

            this.overlayCtx.putImageData(overlayData, 0, 0);
            this.hideProgress();
        });
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

        this.showProgress('Removing watermark... 0%');

        // Send data to worker
        this.worker.postMessage({
            action: 'inpaint',
            imageData: this.currentImageData,
            mask: mask
        });
    }

    /**
     * Handle messages from the Web Worker
     */
    handleWorkerMessage(e) {
        const data = e.data;

        if (data.type === 'progress') {
            this.updateProgressText(`Removing watermark... ${Math.round(data.progress * 100)}%`);
        } else if (data.type === 'complete') {

            // Prepare the before-canvas with the original image data (with watermark)
            const beforeCanvas = document.getElementById('before-canvas');
            const beforeCtx = beforeCanvas.getContext('2d');
            beforeCtx.putImageData(this.currentImageData, 0, 0);
            beforeCanvas.classList.remove('hidden');
            beforeCanvas.style.clipPath = `polygon(0 0, 50% 0, 50% 100%, 0 100%)`;

            // Show slider handle
            const sliderHandle = document.getElementById('slider-handle');
            sliderHandle.classList.remove('hidden');
            sliderHandle.style.left = '50%';

            // Update canvas with result
            this.mainCtx.putImageData(data.result, 0, 0);
            this.currentImageData = data.result;

            // Save state
            this.saveState();

            // Clear overlay and mask
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            this.manualMask = new Uint8Array(this.mainCanvas.width * this.mainCanvas.height);

            this.hideProgress();

            // Show download button
            document.getElementById('download-btn').classList.remove('hidden');

            // Update instructions
            document.getElementById('instruction-text').textContent = 'Watermark removed! Drag the slider to compare. Click Download to save.';
        }
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

            // Hide download button and slider
            document.getElementById('download-btn').classList.add('hidden');
            document.getElementById('before-canvas').classList.add('hidden');
            document.getElementById('slider-handle').classList.add('hidden');

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
