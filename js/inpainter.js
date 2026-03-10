/**
 * Inpainter - Image Inpainting Algorithm for Watermark Removal
 * 
 * This module implements a patch-based inpainting algorithm that fills
 * selected regions using surrounding pixel information. It's optimized
 * for removing small watermarks and icons from image corners.
 */

class Inpainter {
    constructor() {
        this.maxIterations = 50000;
        this.patchSize = 9; // Must be odd
        this.halfPatch = Math.floor(this.patchSize / 2);
    }

    /**
     * Main inpainting function
     * @param {ImageData} imageData - The source image data
     * @param {Uint8Array} mask - Binary mask (255 = pixel to fill, 0 = known pixel)
     * @param {Function} progressCallback - Called with progress (0-1)
     * @returns {ImageData} - The inpainted image
     */
    inpaint(imageData, mask, progressCallback = null) {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        // Create working mask that we'll modify
        let workingMask = new Uint8Array(mask);

        // Create confidence map
        const confidence = new Float32Array(width * height);
        for (let i = 0; i < mask.length; i++) {
            confidence[i] = mask[i] === 0 ? 1.0 : 0.0;
        }

        // Priority queue for fill order
        let fillFront = this._findFillFront(workingMask, width, height);

        let iteration = 0;
        const totalPixels = mask.filter(v => v === 255).length;
        let filledPixels = 0;

        while (fillFront.length > 0 && iteration < this.maxIterations) {
            // Calculate priorities for all fill front pixels
            const priorities = fillFront.map(p => ({
                x: p.x,
                y: p.y,
                priority: this._calculatePriority(p.x, p.y, confidence, workingMask, width, height, data)
            }));

            // Sort by priority (highest first)
            priorities.sort((a, b) => b.priority - a.priority);

            // Process highest priority pixel
            const target = priorities[0];
            const bestMatch = this._findBestPatch(target.x, target.y, data, workingMask, width, height);

            if (bestMatch) {
                this._copyPatch(target.x, target.y, bestMatch.x, bestMatch.y, data, workingMask, width, height);

                // Update confidence and mark as filled for ALL valid pixels in patch
                for (let dy = -this.halfPatch; dy <= this.halfPatch; dy++) {
                    for (let dx = -this.halfPatch; dx <= this.halfPatch; dx++) {
                        const px = target.x + dx;
                        const py = target.y + dy;
                        if (px >= 0 && px < width && py >= 0 && py < height) {
                            const pIdx = py * width + px;
                            if (workingMask[pIdx] === 255) {
                                confidence[pIdx] = 1.0;
                                workingMask[pIdx] = 0;
                                filledPixels++;
                            }
                        }
                    }
                }
            }

            // Update fill front
            fillFront = this._findFillFront(workingMask, width, height);
            iteration++;

            // Report progress
            if (progressCallback && iteration % 10 === 0) {
                progressCallback(Math.min(filledPixels / totalPixels, 1.0));
            }
        }

        // Fill any remaining pixels with simple interpolation
        this._fillRemaining(data, workingMask, width, height);

        if (progressCallback) {
            progressCallback(1.0);
        }

        return new ImageData(data, width, height);
    }

    /**
     * Find the fill front (boundary between known and unknown regions)
     */
    _findFillFront(mask, width, height) {
        const front = [];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;

                if (mask[idx] === 255) {
                    // Check if any neighbor is known
                    const neighbors = [
                        mask[idx - 1], mask[idx + 1],
                        mask[idx - width], mask[idx + width]
                    ];

                    if (neighbors.some(n => n === 0)) {
                        front.push({ x, y });
                    }
                }
            }
        }

        return front;
    }

    /**
     * Calculate priority for a fill front pixel
     * Combines confidence term and data term
     */
    _calculatePriority(x, y, confidence, mask, width, height, data) {
        const idx = y * width + x;

        // Confidence term (average confidence of known pixels in patch)
        let confSum = 0;
        let knownCount = 0;

        for (let dy = -this.halfPatch; dy <= this.halfPatch; dy++) {
            for (let dx = -this.halfPatch; dx <= this.halfPatch; dx++) {
                const px = x + dx;
                const py = y + dy;

                if (px >= 0 && px < width && py >= 0 && py < height) {
                    const pIdx = py * width + px;
                    if (mask[pIdx] === 0) {
                        confSum += confidence[pIdx];
                        knownCount++;
                    }
                }
            }
        }

        const confTerm = knownCount > 0 ? confSum / (this.patchSize * this.patchSize) : 0;

        // Data term (based on gradient strength)
        const dataTerm = this._calculateDataTerm(x, y, data, mask, width, height);

        return confTerm * dataTerm;
    }

    /**
     * Calculate data term based on gradient strength
     */
    _calculateDataTerm(x, y, data, mask, width, height) {
        // Calculate gradients at known neighbors
        let maxGradient = 0;
        const idx = y * width + x;

        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1]
        ];

        for (const [dx, dy] of directions) {
            const px = x + dx;
            const py = y + dy;

            if (px >= 0 && px < width && py >= 0 && py < height) {
                const pIdx = py * width + px;
                if (mask[pIdx] === 0) {
                    // Calculate gradient magnitude
                    const gx = this._getGradientX(px, py, data, mask, width, height);
                    const gy = this._getGradientY(px, py, data, mask, width, height);
                    const grad = Math.sqrt(gx * gx + gy * gy);
                    maxGradient = Math.max(maxGradient, grad);
                }
            }
        }

        return 1 + maxGradient / 255;
    }

    /**
     * Get horizontal gradient
     */
    _getGradientX(x, y, data, mask, width, height) {
        if (x <= 0 || x >= width - 1) return 0;

        const leftIdx = (y * width + x - 1) * 4;
        const rightIdx = (y * width + x + 1) * 4;
        const centerIdx = (y * width + x) * 4;

        // Use luminance for gradient
        const leftLum = this._luminance(data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]);
        const rightLum = this._luminance(data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]);

        return (rightLum - leftLum) / 2;
    }

    /**
     * Get vertical gradient
     */
    _getGradientY(x, y, data, mask, width, height) {
        if (y <= 0 || y >= height - 1) return 0;

        const topIdx = ((y - 1) * width + x) * 4;
        const bottomIdx = ((y + 1) * width + x) * 4;

        const topLum = this._luminance(data[topIdx], data[topIdx + 1], data[topIdx + 2]);
        const bottomLum = this._luminance(data[bottomIdx], data[bottomIdx + 1], data[bottomIdx + 2]);

        return (bottomLum - topLum) / 2;
    }

    /**
     * Calculate luminance from RGB
     */
    _luminance(r, g, b) {
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    /**
     * Find the best matching patch for the target location
     */
    _findBestPatch(targetX, targetY, data, mask, width, height) {
        let bestMatch = null;
        let bestError = Infinity;

        // Search region (larger area around target)
        const searchRadius = Math.min(50, Math.max(width, height) / 4);

        for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
            for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
                const sourceX = targetX + dx;
                const sourceY = targetY + dy;

                // Skip if source patch would be out of bounds
                if (sourceX < this.halfPatch || sourceX >= width - this.halfPatch ||
                    sourceY < this.halfPatch || sourceY >= height - this.halfPatch) {
                    continue;
                }

                // Skip if source patch contains unknown pixels
                if (this._patchContainsMask(sourceX, sourceY, mask, width, height)) {
                    continue;
                }

                // Calculate patch error
                const error = this._calculatePatchError(targetX, targetY, sourceX, sourceY, data, mask, width, height);

                if (error < bestError) {
                    bestError = error;
                    bestMatch = { x: sourceX, y: sourceY };
                }
            }
        }

        return bestMatch;
    }

    /**
     * Check if a patch contains any masked pixels
     */
    _patchContainsMask(cx, cy, mask, width, height) {
        for (let dy = -this.halfPatch; dy <= this.halfPatch; dy++) {
            for (let dx = -this.halfPatch; dx <= this.halfPatch; dx++) {
                const x = cx + dx;
                const y = cy + dy;
                const idx = y * width + x;
                if (mask[idx] === 255) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Calculate SSD error between two patches
     */
    _calculatePatchError(tx, ty, sx, sy, data, mask, width, height) {
        let error = 0;
        let count = 0;

        for (let dy = -this.halfPatch; dy <= this.halfPatch; dy++) {
            for (let dx = -this.halfPatch; dx <= this.halfPatch; dx++) {
                const tx2 = tx + dx;
                const ty2 = ty + dy;
                const sx2 = sx + dx;
                const sy2 = sy + dy;

                const tIdx = (ty2 * width + tx2) * 4;
                const sIdx = (sy2 * width + sx2) * 4;
                const mIdx = ty2 * width + tx2;

                // Only compare known pixels in target patch
                if (mask[mIdx] === 0) {
                    const dr = data[tIdx] - data[sIdx];
                    const dg = data[tIdx + 1] - data[sIdx + 1];
                    const db = data[tIdx + 2] - data[sIdx + 2];

                    error += dr * dr + dg * dg + db * db;
                    count++;
                }
            }
        }

        return count > 0 ? error / count : Infinity;
    }

    /**
     * Copy a patch from source to target
     */
    _copyPatch(tx, ty, sx, sy, data, mask, width, height) {
        for (let dy = -this.halfPatch; dy <= this.halfPatch; dy++) {
            for (let dx = -this.halfPatch; dx <= this.halfPatch; dx++) {
                const tx2 = tx + dx;
                const ty2 = ty + dy;
                const sx2 = sx + dx;
                const sy2 = sy + dy;

                if (tx2 >= 0 && tx2 < width && ty2 >= 0 && ty2 < height &&
                    sx2 >= 0 && sx2 < width && sy2 >= 0 && sy2 < height) {

                    const tIdx = (ty2 * width + tx2) * 4;
                    const sIdx = (sy2 * width + sx2) * 4;
                    const mIdx = ty2 * width + tx2;

                    // Only copy to unknown pixels
                    if (mask[mIdx] === 255) {
                        data[tIdx] = data[sIdx];
                        data[tIdx + 1] = data[sIdx + 1];
                        data[tIdx + 2] = data[sIdx + 2];
                        data[tIdx + 3] = data[sIdx + 3];
                    }
                }
            }
        }
    }

    /**
     * Fill any remaining pixels using simple interpolation
     */
    _fillRemaining(data, mask, width, height) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;

                if (mask[idx] === 255) {
                    this._interpolatePixel(x, y, data, mask, width, height);
                }
            }
        }
    }

    /**
     * Interpolate a single pixel from its neighbors
     */
    _interpolatePixel(x, y, data, mask, width, height) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;

        // Check neighbors in increasing radius
        for (let radius = 1; radius <= 5 && count === 0; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;

                    const px = x + dx;
                    const py = y + dy;

                    if (px >= 0 && px < width && py >= 0 && py < height) {
                        const pIdx = py * width + px;
                        const dIdx = pIdx * 4;

                        if (mask[pIdx] === 0) {
                            r += data[dIdx];
                            g += data[dIdx + 1];
                            b += data[dIdx + 2];
                            a += data[dIdx + 3];
                            count++;
                        }
                    }
                }
            }
        }

        if (count > 0) {
            const idx = (y * width + x) * 4;
            data[idx] = r / count;
            data[idx + 1] = g / count;
            data[idx + 2] = b / count;
            data[idx + 3] = a / count;
        }
    }

    /**
     * Simple inpainting for small regions using radial interpolation
     * Faster alternative for small watermarks
     */
    quickInpaint(imageData, mask, iterations = 100) {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Float32Array(imageData.data);

        for (let iter = 0; iter < iterations; iter++) {
            const newData = new Float32Array(data);

            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = y * width + x;

                    if (mask[idx] === 255) {
                        const dIdx = idx * 4;

                        // Weighted average of neighbors
                        let weights = 0;
                        let r = 0, g = 0, b = 0, a = 0;

                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (dx === 0 && dy === 0) continue;

                                const px = x + dx;
                                const py = y + dy;
                                const pIdx = py * width + px;
                                const pdIdx = pIdx * 4;

                                // Weight by inverse distance
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                const weight = 1 / dist;

                                r += data[pdIdx] * weight;
                                g += data[pdIdx + 1] * weight;
                                b += data[pdIdx + 2] * weight;
                                a += data[pdIdx + 3] * weight;
                                weights += weight;
                            }
                        }

                        if (weights > 0) {
                            newData[dIdx] = r / weights;
                            newData[dIdx + 1] = g / weights;
                            newData[dIdx + 2] = b / weights;
                            newData[dIdx + 3] = a / weights;
                        }
                    }
                }
            }

            // Copy back
            for (let i = 0; i < data.length; i++) {
                data[i] = newData[i];
            }
        }

        return new ImageData(
            new Uint8ClampedArray(data),
            width,
            height
        );
    }

    /**
     * Create a circular mask for the given center and radius
     */
    static createCircularMask(width, height, centerX, centerY, radius) {
        const mask = new Uint8Array(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
                mask[y * width + x] = dist <= radius ? 255 : 0;
            }
        }

        return mask;
    }

    /**
     * Create a rectangular mask
     */
    static createRectMask(width, height, x, y, w, h) {
        const mask = new Uint8Array(width * height);

        for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
            for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
                mask[py * width + px] = 255;
            }
        }

        return mask;
    }

    /**
     * Detect potential watermark regions in corners
     * Returns array of candidate regions {x, y, width, height, confidence}
     */
    static detectWatermarkRegions(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        const regions = [];
        const cornerSize = Math.min(150, Math.floor(Math.min(width, height) * 0.15));

        // Check all four corners
        const corners = [
            { x: 0, y: height - cornerSize, name: 'bottom-left' },
            { x: width - cornerSize, y: height - cornerSize, name: 'bottom-right' },
            { x: 0, y: 0, name: 'top-left' },
            { x: width - cornerSize, y: 0, name: 'top-right' }
        ];

        for (const corner of corners) {
            const region = Inpainter._analyzeCorner(
                data, width, height,
                corner.x, corner.y, cornerSize, cornerSize
            );

            if (region.confidence > 0.3) {
                regions.push(region);
            }
        }

        // Sort by confidence
        regions.sort((a, b) => b.confidence - a.confidence);

        return regions;
    }

    /**
     * Analyze a corner region for watermark characteristics
     */
    static _analyzeCorner(data, width, height, startX, startY, regionW, regionH) {
        let edgeScore = 0;
        let colorVariance = 0;
        let brightnessSum = 0;
        let pixelCount = 0;

        const colors = [];

        for (let y = startY; y < Math.min(height, startY + regionH); y++) {
            for (let x = startX; x < Math.min(width, startX + regionW); x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                colors.push({ r, g, b });
                brightnessSum += (r + g + b) / 3;
                pixelCount++;
            }
        }

        if (pixelCount === 0) {
            return { x: startX, y: startY, width: regionW, height: regionH, confidence: 0 };
        }

        const avgBrightness = brightnessSum / pixelCount;

        // Calculate color variance
        let varianceSum = 0;
        for (const c of colors) {
            const brightness = (c.r + c.g + c.b) / 3;
            varianceSum += (brightness - avgBrightness) ** 2;
        }
        colorVariance = varianceSum / pixelCount;

        let minX = startX + regionW, maxX = startX, minY = startY + regionH, maxY = startY;

        // Detect edges using simple gradient
        for (let y = startY + 1; y < Math.min(height - 1, startY + regionH - 1); y++) {
            for (let x = startX + 1; x < Math.min(width - 1, startX + regionW - 1); x++) {
                const idx = (y * width + x) * 4;
                const rightIdx = (y * width + x + 1) * 4;
                const bottomIdx = ((y + 1) * width + x) * 4;

                const gx = Math.abs(data[idx] - data[rightIdx]);
                const gy = Math.abs(data[idx] - data[bottomIdx]);
                const grad = (gx + gy) / 2;
                edgeScore += grad;

                if (grad > 20) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        const normalizedEdgeScore = edgeScore / (regionW * regionH);
        const normalizedVariance = colorVariance / 65025; // Normalize to 0-1

        let confidence = 0;

        let tightW = maxX - minX;
        let tightH = maxY - minY;

        // Check if there is a tight dense edge cluster denoting a logo
        if (tightW > 0 && tightH > 0 && tightW < regionW * 0.8 && tightH < regionH * 0.8) {
            // Highly likely a small watermark!
            confidence += 0.6;

            // Further boost confidence if variance is low (plain background)
            if (normalizedVariance < 0.3) {
                confidence += 0.3;
            }

            // Return tight bounding box plus padding
            return {
                x: Math.max(0, minX - 10),
                y: Math.max(0, minY - 10),
                width: tightW + 20,
                height: tightH + 20,
                confidence: Math.min(confidence, 1.0),
                edgeScore: normalizedEdgeScore,
                variance: normalizedVariance
            };
        }

        // Fallback: Good edge density for text/logos
        if (normalizedEdgeScore > 10 && normalizedEdgeScore < 100) {
            confidence += 0.4;
        }

        // Lower variance suggests solid color or simple logo
        if (normalizedVariance < 0.3) {
            confidence += 0.3;
        }

        // Check for high contrast edges (typical of logos)
        if (normalizedEdgeScore > 30) {
            confidence += 0.3;
        }

        return {
            x: startX,
            y: startY,
            width: regionW,
            height: regionH,
            confidence: Math.min(confidence, 1.0),
            edgeScore: normalizedEdgeScore,
            variance: normalizedVariance
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Inpainter;
}
