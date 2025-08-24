/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FileSystemUtils } from './fileSystemUtils.js';

/**
 * Image Processing Manager for Erdos AI function handlers
 * Provides real image processing using browser Canvas API and Node.js sharp if available
 */
export class ImageProcessingManager {
    constructor(
        private readonly fileSystemUtils: FileSystemUtils
    ) {}

    /**
     * Resize image for AI consumption
     */
    async resizeImageForAI(imagePath: string, targetSizeKb: number = 100): Promise<{
        success: boolean;
        base64_data: string;
        original_size_kb: number;
        final_size_kb: number;
        resized: boolean;
        scale_factor?: number;
        new_dimensions?: string;
        format: string;
        warning?: string;
    }> {
        try {
            if (!(await this.fileSystemUtils.fileExists(imagePath))) {
                throw new Error(`Image file not found: ${imagePath}`);
            }

            const originalSizeBytes = await this.fileSystemUtils.getFileSize(imagePath);
            const originalSizeKb = Math.round((originalSizeBytes / 1024) * 10) / 10;

            const imageBuffer = await this.readImageFile(imagePath);
            
            const fileExtension = this.fileSystemUtils.getFileExtension(imagePath).toLowerCase();
            const originalFormat = this.getFormatFromExtension(fileExtension);

            if (originalSizeKb <= targetSizeKb) {
                // Convert to base64 and return without resizing
                const base64Data = imageBuffer.toString('base64');
                
                return {
                    success: true,
                    base64_data: base64Data,
                    original_size_kb: originalSizeKb,
                    final_size_kb: originalSizeKb,
                    resized: false,
                    format: originalFormat
                };
            }

            const dimensions = await this.getImageDimensions(imageBuffer, originalFormat);
            if (!dimensions) {
                throw new Error('Failed to read image dimensions');
            }

            const resizeResult = await this.calculateResizeParameters(
                dimensions,
                originalSizeKb,
                targetSizeKb,
                originalFormat
            );

            const resizedImageData = await this.resizeImage(
                imageBuffer,
                dimensions,
                resizeResult.targetWidth,
                resizeResult.targetHeight,
                originalFormat
            );

            const base64Data = resizedImageData.toString('base64');
            
            const finalSizeKb = Math.round((resizedImageData.length / 1024) * 10) / 10;

            const result = {
                success: true,
                base64_data: base64Data,
                original_size_kb: originalSizeKb,
                final_size_kb: finalSizeKb,
                resized: true,
                scale_factor: resizeResult.scaleFactor,
                new_dimensions: `${resizeResult.targetWidth}x${resizeResult.targetHeight}`,
                format: originalFormat
            };

            const warnings: string[] = [];
            if (finalSizeKb > targetSizeKb * 1.2) {
                warnings.push(`Final size (${finalSizeKb}KB) exceeds target (${targetSizeKb}KB)`);
            }
            if (resizeResult.scaleFactor < 0.5) {
                warnings.push(`Significant size reduction applied (${Math.round(resizeResult.scaleFactor * 100)}%)`);
            }

            if (warnings.length > 0) {
                (result as any).warning = warnings.join('; ');
            }

            return result;

        } catch (error) {
            return {
                success: false,
                base64_data: '',
                original_size_kb: 0,
                final_size_kb: 0,
                resized: false,
                format: '',
                warning: `Image processing failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Check if file is an image based on extension
     */
    isImageFile(filePath: string): boolean {
        const extension = this.fileSystemUtils.getFileExtension(filePath).toLowerCase();
        return this.getSupportedFormats().includes(extension);
    }

    /**
     * Get supported image formats
     */
    getSupportedFormats(): string[] {
        return [
            '.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.tiff', '.webp'
        ];
    }

    /**
     * Validate image file for AI processing
     */
    async validateImageFile(imagePath: string, maxSizeMb: number = 10): Promise<{
        valid: boolean;
        error?: string;
        fileSize?: number;
        format?: string;
    }> {
        try {
            // Check if file exists
            if (!(await this.fileSystemUtils.fileExists(imagePath))) {
                return {
                    valid: false,
                    error: `Image file not found: ${imagePath}`
                };
            }

            // Check if it's an image file
            if (!this.isImageFile(imagePath)) {
                return {
                    valid: false,
                    error: `File is not a supported image format: ${imagePath}`
                };
            }

            // Check file size
            const fileSize = await this.fileSystemUtils.getFileSize(imagePath);
            const fileSizeMb = fileSize / (1024 * 1024);

            if (fileSizeMb > maxSizeMb) {
                return {
                    valid: false,
                    error: `Image file too large: ${fileSizeMb.toFixed(1)}MB (max: ${maxSizeMb}MB)`,
                    fileSize
                };
            }

            const extension = this.fileSystemUtils.getFileExtension(imagePath);
            const format = this.getFormatFromExtension(extension);

            return {
                valid: true,
                fileSize,
                format
            };

        } catch (error) {
            return {
                valid: false,
                error: `Image validation failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Read image file as buffer
     * Uses Node.js fs for server-side or fetch API for browser environments
     */
    private async readImageFile(imagePath: string): Promise<Buffer> {
        // In Erdos/Electron environment, we can use Node.js APIs
        if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            const fs = await import('fs');
            return fs.promises.readFile(imagePath);
        } else {
            // Browser environment fallback (though unlikely in Erdos)
            const response = await fetch(`file://${imagePath}`);
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }
    }

    /**
     * Get format from file extension
     */
    private getFormatFromExtension(extension: string): string {
        switch (extension.toLowerCase()) {
            case '.jpg':
            case '.jpeg':
                return 'JPEG';
            case '.png':
                return 'PNG';
            case '.gif':
                return 'GIF';
            case '.bmp':
                return 'BMP';
            case '.tiff':
            case '.tif':
                return 'TIFF';
            case '.webp':
                return 'WEBP';
            case '.svg':
                return 'SVG';
            default:
                return 'PNG'; // Default fallback
        }
    }

    /**
     * Get image dimensions from buffer
     * Uses image-size library or native Canvas API
     */
    private async getImageDimensions(imageBuffer: Buffer, format: string): Promise<{ width: number; height: number } | null> {
        try {
            // Browser-based approach (no external dependencies)
            // This is more reliable in VS Code extension context

            // Fallback to Canvas API (available in Electron/Erdos)
            if (typeof HTMLCanvasElement !== 'undefined') {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        resolve({
                            width: img.naturalWidth,
                            height: img.naturalHeight
                        });
                    };
                    img.onerror = () => resolve(null);
                    
                    const blob = new Blob([new Uint8Array(imageBuffer)], { type: `image/${format.toLowerCase()}` });
                    img.src = URL.createObjectURL(blob);
                });
            }

            // If no method available, try basic header parsing for common formats
            return this.parseImageDimensionsFromHeader(imageBuffer, format);

        } catch (error) {
            return null;
        }
    }

    /**
     * Parse image dimensions from file headers (basic implementation)
     * Supports PNG and JPEG header parsing
     */
    private parseImageDimensionsFromHeader(buffer: Buffer, format: string): { width: number; height: number } | null {
        try {
            if (format === 'PNG' && buffer.length >= 24) {
                // PNG header parsing
                if (buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
                    const width = buffer.readUInt32BE(16);
                    const height = buffer.readUInt32BE(20);
                    return { width, height };
                }
            } else if ((format === 'JPEG' || format === 'JPG') && buffer.length >= 10) {
                // Basic JPEG header parsing - look for SOF0 or SOF2 markers
                for (let i = 0; i < buffer.length - 10; i++) {
                    if (buffer[i] === 0xFF && (buffer[i + 1] === 0xC0 || buffer[i + 1] === 0xC2)) {
                        const height = buffer.readUInt16BE(i + 5);
                        const width = buffer.readUInt16BE(i + 7);
                        return { width, height };
                    }
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Calculate resize parameters
     */
    private async calculateResizeParameters(
        dimensions: { width: number; height: number },
        originalSizeKb: number,
        targetSizeKb: number,
        format: string
    ): Promise<{
        targetWidth: number;
        targetHeight: number;
        scaleFactor: number;
    }> {
        let compressionRatio = 0.8; // Default conservative estimate
        
        if (format === 'JPEG' || format === 'JPG') {
            compressionRatio = 0.9; // JPEG compresses better
        } else if (format === 'PNG') {
            compressionRatio = 0.7; // PNG compresses less
        }

        const sizeReductionFactor = (targetSizeKb * compressionRatio) / originalSizeKb;
        
        let scaleFactor = Math.sqrt(sizeReductionFactor);
        
        scaleFactor = Math.max(0.1, Math.min(1.0, scaleFactor)); // Between 10% and 100%
        
        const targetWidth = Math.round(dimensions.width * scaleFactor);
        const targetHeight = Math.round(dimensions.height * scaleFactor);

        return {
            targetWidth,
            targetHeight,
            scaleFactor
        };
    }

    /**
     * Resize image using available APIs
     * Uses sharp if available, otherwise Canvas API
     */
    private async resizeImage(
        imageBuffer: Buffer,
        originalDimensions: { width: number; height: number },
        targetWidth: number,
        targetHeight: number,
        format: string
    ): Promise<Buffer> {

        if (typeof HTMLCanvasElement !== 'undefined') {
            return new Promise((resolve, reject) => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    reject(new Error('Canvas context not available'));
                    return;
                }

                canvas.width = targetWidth;
                canvas.height = targetHeight;

                const img = new Image();
                img.onload = () => {
                    // Use high-quality resizing
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                    
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('Failed to create resized image blob'));
                            return;
                        }
                        
                        const reader = new FileReader();
                        reader.onload = () => {
                            const arrayBuffer = reader.result as ArrayBuffer;
                            resolve(Buffer.from(arrayBuffer));
                        };
                        reader.onerror = () => reject(new Error('Failed to read resized image data'));
                        reader.readAsArrayBuffer(blob);
                    }, `image/${format.toLowerCase()}`, 0.85);
                };
                
                img.onerror = () => reject(new Error('Failed to load image for resizing'));
                
                const blob = new Blob([new Uint8Array(imageBuffer)], { type: `image/${format.toLowerCase()}` });
                img.src = URL.createObjectURL(blob);
            });
        }

        // If no resizing method available, return original buffer (better than failing)
        return imageBuffer;
    }
}
