/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IFileSystemUtils } from '../../erdosAiUtils/common/fileSystemUtils.js';
import { IImageProcessingManager } from '../common/imageProcessingManager.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export class ImageProcessingManager extends Disposable implements IImageProcessingManager {
    readonly _serviceBrand: undefined;
    
    constructor(
        @IFileSystemUtils private readonly fileSystemUtils: IFileSystemUtils,
        @ICommonUtils private readonly commonUtils: ICommonUtils
    ) {
        super();
    }

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
            
            const fileExtension = this.commonUtils.getFileExtension(imagePath).toLowerCase();
            const originalFormat = this.getFormatFromExtension(fileExtension);

            if (originalSizeKb <= targetSizeKb) {
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

    async validateImageFile(imagePath: string, maxSizeMb: number = 10): Promise<{
        valid: boolean;
        error?: string;
        fileSize?: number;
        format?: string;
    }> {
        try {
            if (!(await this.fileSystemUtils.fileExists(imagePath))) {
                return {
                    valid: false,
                    error: `Image file not found: ${imagePath}`
                };
            }

            if (!this.isImageFile(imagePath)) {
                return {
                    valid: false,
                    error: `File is not a supported image format: ${imagePath}`
                };
            }

            const fileSize = await this.fileSystemUtils.getFileSize(imagePath);
            const fileSizeMb = fileSize / (1024 * 1024);

            if (fileSizeMb > maxSizeMb) {
                return {
                    valid: false,
                    error: `Image file too large: ${fileSizeMb.toFixed(1)}MB (max: ${maxSizeMb}MB)`,
                    fileSize
                };
            }

            const extension = this.commonUtils.getFileExtension(imagePath);
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

    isImageFile(filePath: string): boolean {
        const extension = this.commonUtils.getFileExtension(filePath).toLowerCase();
        return this.getSupportedFormats().includes(extension);
    }

    getSupportedFormats(): string[] {
        return [
            '.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.tiff', '.webp'
        ];
    }

    private async readImageFile(imagePath: string): Promise<Buffer> {
        if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            const fs = await import('fs');
            return fs.promises.readFile(imagePath);
        } else {
            const response = await fetch(`file://${imagePath}`);
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }
    }

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
                return 'PNG';
        }
    }

    private async getImageDimensions(imageBuffer: Buffer, format: string): Promise<{ width: number; height: number } | null> {
        try {
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

            return this.parseImageDimensionsFromHeader(imageBuffer, format);

        } catch (error) {
            return null;
        }
    }

    private parseImageDimensionsFromHeader(buffer: Buffer, format: string): { width: number; height: number } | null {
        try {
            if (format === 'PNG' && buffer.length >= 24) {
                if (buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
                    const width = buffer.readUInt32BE(16);
                    const height = buffer.readUInt32BE(20);
                    return { width, height };
                }
            } else if ((format === 'JPEG' || format === 'JPG') && buffer.length >= 10) {
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
        let compressionRatio = 0.8;
        
        if (format === 'JPEG' || format === 'JPG') {
            compressionRatio = 0.9;
        } else if (format === 'PNG') {
            compressionRatio = 0.7;
        }

        const sizeReductionFactor = (targetSizeKb * compressionRatio) / originalSizeKb;
        
        let scaleFactor = Math.sqrt(sizeReductionFactor);
        
        scaleFactor = Math.max(0.1, Math.min(1.0, scaleFactor));
        
        const targetWidth = Math.round(dimensions.width * scaleFactor);
        const targetHeight = Math.round(dimensions.height * scaleFactor);

        return {
            targetWidth,
            targetHeight,
            scaleFactor
        };
    }

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

        return imageBuffer;
    }
}
