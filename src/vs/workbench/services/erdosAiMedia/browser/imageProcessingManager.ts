/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IFileSystemUtils } from '../../erdosAiUtils/common/fileSystemUtils.js';
import { IImageProcessingManager } from '../common/imageProcessingManager.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer, encodeBase64, decodeBase64 } from '../../../../base/common/buffer.js';

export class ImageProcessingManager extends Disposable implements IImageProcessingManager {
    readonly _serviceBrand: undefined;
    
    constructor(
        @IFileSystemUtils private readonly fileSystemUtils: IFileSystemUtils,
        @ICommonUtils private readonly commonUtils: ICommonUtils,
        @IFileService private readonly fileService: IFileService
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
                const base64Data = encodeBase64(imageBuffer);
                
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

            const base64Data = encodeBase64(resizedImageData);
            
            const finalSizeKb = Math.round((resizedImageData.byteLength / 1024) * 10) / 10;

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

    private async readImageFile(imagePath: string): Promise<VSBuffer> {
        if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            const fs = await import('fs');
            const nodeBuffer = await fs.promises.readFile(imagePath);
            return VSBuffer.wrap(new Uint8Array(nodeBuffer));
        } else {
            // Use VSCode's file service directly like ImageAttachmentService does
            const imageUri = URI.file(imagePath);
            const imageData = await this.fileService.readFile(imageUri);
            return imageData.value;
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

    private async getImageDimensions(imageBuffer: VSBuffer, format: string): Promise<{ width: number; height: number } | null> {
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
                    
                    const blob = new Blob([new Uint8Array(imageBuffer.buffer)], { type: `image/${format.toLowerCase()}` });
                    img.src = URL.createObjectURL(blob);
                });
            }

            return this.parseImageDimensionsFromHeader(imageBuffer, format);

        } catch (error) {
            return null;
        }
    }

    private parseImageDimensionsFromHeader(buffer: VSBuffer, format: string): { width: number; height: number } | null {
        try {
            const bytes = new Uint8Array(buffer.buffer);
            if (format === 'PNG' && bytes.length >= 24) {
                // Check PNG signature
                const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
                let isPng = true;
                for (let i = 0; i < 8; i++) {
                    if (bytes[i] !== pngSignature[i]) {
                        isPng = false;
                        break;
                    }
                }
                if (isPng) {
                    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
                    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
                    return { width, height };
                }
            } else if ((format === 'JPEG' || format === 'JPG') && bytes.length >= 10) {
                for (let i = 0; i < bytes.length - 10; i++) {
                    if (bytes[i] === 0xFF && (bytes[i + 1] === 0xC0 || bytes[i + 1] === 0xC2)) {
                        const height = (bytes[i + 5] << 8) | bytes[i + 6];
                        const width = (bytes[i + 7] << 8) | bytes[i + 8];
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
        imageBuffer: VSBuffer,
        originalDimensions: { width: number; height: number },
        targetWidth: number,
        targetHeight: number,
        format: string
    ): Promise<VSBuffer> {

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
                        
                        blob.arrayBuffer().then(arrayBuffer => {
                            resolve(VSBuffer.wrap(new Uint8Array(arrayBuffer)));
                        }).catch(() => reject(new Error('Failed to read resized image data')));
                    }, `image/${format.toLowerCase()}`, 0.85);
                };
                
                img.onerror = () => reject(new Error('Failed to load image for resizing'));
                
                const blob = new Blob([new Uint8Array(imageBuffer.buffer)], { type: `image/${format.toLowerCase()}` });
                img.src = URL.createObjectURL(blob);
            });
        }

        return imageBuffer;
    }

    async extractImageDataFromPlotClient(plotClient: any): Promise<{
        success: boolean;
        base64_data: string;
        original_size_kb: number;
        final_size_kb: number;
        resized: boolean;
        format: string;
        warning?: string;
    }> {
        
        try {
            // Check if it's a StaticPlotClient with URI
            if (plotClient && 'uri' in plotClient && plotClient.uri) {
                const uri = plotClient.uri;
                
                // Handle data URIs
                if (uri.startsWith('data:')) {
                    const matches = uri.match(/^data:([^;]+);base64,(.+)$/);
                    if (matches) {
                        const mimeType = matches[1];
                        // Convert plot base64 data using VSCode's encoding to match file-based images
                        const plotBase64Data = matches[2].replace(/\s/g, ''); // Remove any whitespace
                        
                        // Decode the plot's base64 back to a buffer, then re-encode using VSCode's method
                        // This ensures consistency with file-based image processing
                        const buffer = decodeBase64(plotBase64Data);
                        const base64Data = encodeBase64(buffer);
                        
                        // Calculate size using browser-compatible method
                        // Each base64 character represents 6 bits, so 4 characters = 3 bytes
                        // Remove padding characters for accurate calculation
                        const base64Length = base64Data.replace(/=/g, '').length;
                        const byteLength = Math.floor((base64Length * 3) / 4);
                        const sizeKb = Math.round((byteLength / 1024) * 10) / 10;
                        
                        // Determine format from mime type
                        let format = 'PNG';
                        if (mimeType.includes('jpeg')) format = 'JPEG';
                        else if (mimeType.includes('png')) format = 'PNG';
                        else if (mimeType.includes('svg')) format = 'SVG';
                        else if (mimeType.includes('gif')) format = 'GIF';
                        
                        return {
                            success: true,
                            base64_data: base64Data,
                            original_size_kb: sizeKb,
                            final_size_kb: sizeKb,
                            resized: false,
                            format: format
                        };
                    }
                }
                
                // Handle file URIs by reading the file
                if (uri.startsWith('file://')) {
                    const filePath = uri.replace('file://', '');
                    return await this.resizeImageForAI(filePath, 100);
                }
            }
            
            // Check if it's a PlotClientInstance with existing lastRender data
            if (plotClient && 'lastRender' in plotClient && plotClient.lastRender && plotClient.lastRender.uri) {
                // Use the existing rendered data - this is the same approach as the plots pane
                const lastRender = plotClient.lastRender;
                return await this.extractImageDataFromPlotClient({ uri: lastRender.uri });
            }
            
            throw new Error('Unable to extract image data from plot client');
            
        } catch (error) {
            return {
                success: false,
                base64_data: '',
                original_size_kb: 0,
                final_size_kb: 0,
                resized: false,
                format: '',
                warning: `Plot image extraction failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
