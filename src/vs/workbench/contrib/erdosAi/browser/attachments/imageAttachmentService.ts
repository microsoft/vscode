/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer, decodeBase64, encodeBase64 } from '../../../../../base/common/buffer.js';
import { CommonUtils } from '../utils/commonUtils.js';

export interface IAttachedImage {
	id: string;
	filename: string;
			originalPath: string;
		localPath: string;
		mimeType: string;
		base64Data: string;
		timestamp: string;
		size: number;
		originalHash: string; // MD5 hash of original file for deduplication
}

export interface IImageAttachmentService {
	readonly onImagesChanged: Event<IAttachedImage[]>;
	
	attachImage(imagePath: string): Promise<IAttachedImage>;
	attachImageFromFile(file: File): Promise<IAttachedImage>;
	attachImageFromDataUrl(dataUrl: string, fileName?: string): Promise<IAttachedImage>;
	attachPlotFromService(plotId: string): Promise<IAttachedImage | null>;
	
	removeImage(imageId: string): Promise<void>;
	clearAllImages(): Promise<void>;
	
	getAttachedImages(): IAttachedImage[];
	checkImageDuplicate(imagePath: string): Promise<boolean>;
	
	// Plot-specific methods
	getAvailablePlots(): Promise<Array<{ id: string; metadata: any }>>;
}

/**
 * Service to manage image attachments for Erdos AI conversations
 * Based on Rao's image attachment implementation
 */
export class ImageAttachmentService extends Disposable implements IImageAttachmentService {
	private readonly _onImagesChanged = this._register(new Emitter<IAttachedImage[]>());
	readonly onImagesChanged: Event<IAttachedImage[]> = this._onImagesChanged.event;

	private _attachedImages: IAttachedImage[] = [];
	private readonly _maxImages = 3; // Same as Rao's limit
	private readonly _maxSizeKB = 100; // 100KB limit like Rao

	// Utility functions
	private generateId(): string {
		return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
	}

	private async hashBuffer(buffer: VSBuffer): Promise<string> {
		if (typeof crypto !== 'undefined' && crypto.subtle) {
			const hashBuffer = await crypto.subtle.digest('SHA-256', buffer.buffer);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		} else {
			// Fallback for environments without crypto.subtle
			// Simple hash based on content length and first/last bytes
			const bytes = buffer.buffer;
			const view = new Uint8Array(bytes);
			let hash = bytes.byteLength;
			if (view.length > 0) {
				hash = hash * 31 + view[0];
				if (view.length > 1) {
					hash = hash * 31 + view[view.length - 1];
				}
				if (view.length > 2) {
					hash = hash * 31 + view[Math.floor(view.length / 2)];
				}
			}
			return hash.toString(16);
		}
	}

	constructor(
		private readonly _fileService: IFileService,
		private readonly _storageService: IStorageService,
		private readonly _logService: ILogService,
		private readonly _conversationId: string
	) {
		super();
		this._loadImagesFromStorage();
	}

	private async _getImagesDirectory(): Promise<URI> {
		// Create conversation-specific images directory similar to Rao's pattern
		// Use OS temp directory for now - in production this should use a persistent storage location
		const tempDir = URI.file('/tmp'); // This would need to be platform-specific
		return URI.joinPath(tempDir, 'erdosAi', 'conversations', `conversation_${this._conversationId}`, 'images_attached');
	}

	private _loadImagesFromStorage(): void {
		try {
			const storageKey = `erdosAi.images.${this._conversationId}`;
			const imagesData = this._storageService.get(storageKey, /* scope */ 0);
			if (imagesData) {
				const parsedImages = JSON.parse(imagesData);
				
				// Check if images have originalHash field (for backward compatibility)
				parsedImages.forEach((img: any) => {
					if (!img.originalHash) {
						img.originalHash = ''; // Set empty string for old images
					}
				});
				
				this._attachedImages = parsedImages;
				// Don't fire the event during initialization to avoid premature UI updates
			} else {
				this._attachedImages = [];
			}
		} catch (error) {
			this._logService.error('Failed to load images from storage', error);
			this._attachedImages = [];
		}
	}

	private async _saveImagesToStorage(): Promise<void> {
		try {
			const storageKey = `erdosAi.images.${this._conversationId}`;
			const serializedData = JSON.stringify(this._attachedImages);
			this._storageService.store(storageKey, serializedData, /* scope */ 0, /* target */ 1);
			
			// Verify storage by reading it back
			const stored = this._storageService.get(storageKey, /* scope */ 0);
			if (stored !== serializedData) {
				this._logService.error('Storage verification failed - data was not saved correctly');
			}
		} catch (error) {
			this._logService.error('Failed to save images to storage', error);
			throw error; // Re-throw to make the error visible to the caller
		}
	}

	async attachImage(imagePath: string): Promise<IAttachedImage> {
		// Check limits
		if (this._attachedImages.length >= this._maxImages) {
			throw new Error(`Only ${this._maxImages} images can be attached.`);
		}

		// Read and process the image
		const imageUri = URI.file(imagePath);
		const imageData = await this._fileService.readFile(imageUri);
		const fileName = CommonUtils.getBasename(imageUri.path) || 'image.png';
		
		// Check for duplicates by original hash
		const originalHash = await this.hashBuffer(imageData.value);
		const isDuplicate = this._attachedImages.some(img => img.originalHash === originalHash);
		if (isDuplicate) {
			throw new Error('This image content is already attached.');
		}
		
		// Determine MIME type
		const fileExt = CommonUtils.getFileExtension(fileName).toLowerCase() || 'png';
		const mimeType = this._getMimeType(fileExt);

		// Copy to local images directory like Rao does
		const imagesDir = await this._getImagesDirectory();
		await this._ensureDirectoryExists(imagesDir);
		
		// Generate unique filename to avoid conflicts
		const localFileName = await this._generateUniqueFileName(imagesDir, fileName);
		const localPath = URI.joinPath(imagesDir, localFileName);
		
		// Copy the file to local storage
		await this._fileService.copy(imageUri, localPath);

		// Resize if needed
		const resizedData = await this._resizeImageIfNeeded(imageData.value, mimeType);
		const base64Data = encodeBase64(resizedData);

		// Create image record
		const attachedImage: IAttachedImage = {
			id: this.generateId(),
			filename: fileName,
			originalPath: imagePath,
			localPath: localPath.fsPath, // Use the copied file path
			mimeType,
			base64Data,
			timestamp: new Date().toISOString(),
			size: resizedData.byteLength,
			originalHash
		};

		this._attachedImages.push(attachedImage);
		await this._saveImagesToStorage();
		this._onImagesChanged.fire(this._attachedImages);

		return attachedImage;
	}

	async attachImageFromFile(file: File): Promise<IAttachedImage> {
		// Check limits
		if (this._attachedImages.length >= this._maxImages) {
			throw new Error(`Only ${this._maxImages} images can be attached.`);
		}

		// Convert file to buffer
		const arrayBuffer = await file.arrayBuffer();
		const buffer = VSBuffer.wrap(new Uint8Array(arrayBuffer));

		// Check for duplicates by content hash of ORIGINAL file (like Rao)
		const originalHash = await this.hashBuffer(buffer);
		const isDuplicate = this._attachedImages.some(img => img.originalHash === originalHash);
		
		if (isDuplicate) {
			throw new Error('This image content is already attached to the conversation.');
		}

		// Resize if needed
		const resizedData = await this._resizeImageIfNeeded(buffer, file.type);
		const base64Data = encodeBase64(resizedData);

		// Create image record
		const attachedImage: IAttachedImage = {
			id: this.generateId(),
			filename: file.name,
			originalPath: `dropped:${file.name}`,
			localPath: `dropped:${file.name}`,
			mimeType: file.type,
			base64Data,
			timestamp: new Date().toISOString(),
			size: resizedData.byteLength,
			originalHash
		};

		this._attachedImages.push(attachedImage);
		
		// Immediately save to storage to ensure persistence
		await this._saveImagesToStorage();
		
		// Fire event to update UI with current state
		this._onImagesChanged.fire([...this._attachedImages]); // Use spread to force new array reference

		return attachedImage;
	}

	async attachImageFromDataUrl(dataUrl: string, fileName?: string): Promise<IAttachedImage> {
		// Check limits
		if (this._attachedImages.length >= this._maxImages) {
			throw new Error(`Only ${this._maxImages} images can be attached.`);
		}

		// Parse data URL
		const [header, data] = dataUrl.split(',');
		if (!header || !data) {
			throw new Error('Invalid data URL format');
		}

		// Extract MIME type
		const mimeMatch = header.match(/data:([^;]+)/);
		const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

		// Decode base64
		const buffer = decodeBase64(data);

		// Check for duplicates by original hash
		const originalHash = await this.hashBuffer(buffer);
		const isDuplicate = this._attachedImages.some(img => img.originalHash === originalHash);
		
		if (isDuplicate) {
			throw new Error('This image content is already attached to the conversation.');
		}

		// Generate filename if not provided
		const finalFileName = fileName || `pasted_image_${Date.now()}.${mimeType.split('/')[1] || 'png'}`;

		// Resize if needed
		const resizedData = await this._resizeImageIfNeeded(buffer, mimeType);
		const base64Data = encodeBase64(resizedData);

		// Create image record
		const attachedImage: IAttachedImage = {
			id: this.generateId(),
			filename: finalFileName,
			originalPath: `pasted:${finalFileName}`,
			localPath: `pasted:${finalFileName}`,
			mimeType,
			base64Data,
			timestamp: new Date().toISOString(),
			size: resizedData.byteLength,
			originalHash
		};

		this._attachedImages.push(attachedImage);
		
		// Immediately save to storage to ensure persistence
		await this._saveImagesToStorage();
		
		// Fire event to update UI with current state
		this._onImagesChanged.fire([...this._attachedImages]); // Use spread to force new array reference

		return attachedImage;
	}

	async attachPlotFromService(plotId: string): Promise<IAttachedImage | null> {
		// TODO: Implement plot service integration
		// This requires access to IErdosPlotsService which needs to be injected
		this._logService.warn('Plot attachment requires Erdos plots service integration', { plotId });
		return null;
	}

	async removeImage(imageId: string): Promise<void> {
		const index = this._attachedImages.findIndex(img => img.id === imageId);
		if (index >= 0) {
			const image = this._attachedImages[index];
			
			// Remove from memory
			this._attachedImages.splice(index, 1);
			
			// Clean up local file if it exists (like Rao does)
			try {
				if (image.localPath && !image.localPath.startsWith('dropped:') && !image.localPath.startsWith('pasted:')) {
					const localUri = URI.file(image.localPath);
					if (await this._fileService.exists(localUri)) {
						await this._fileService.del(localUri);
					}
				}
			} catch (error) {
				this._logService.warn('Failed to delete local image file:', error);
			}
			
			// Immediately save to storage
			await this._saveImagesToStorage();
			
			// Fire event with spread to force new array reference
			this._onImagesChanged.fire([...this._attachedImages]);
		}
	}

	async clearAllImages(): Promise<void> {
		// Clean up local files like Rao does
		for (const image of this._attachedImages) {
			try {
				if (image.localPath && !image.localPath.startsWith('dropped:') && !image.localPath.startsWith('pasted:')) {
					const localUri = URI.file(image.localPath);
					if (await this._fileService.exists(localUri)) {
						await this._fileService.del(localUri);
					}
				}
			} catch (error) {
				this._logService.warn('Failed to delete local image file:', error);
			}
		}
		
		// Clean up the entire images directory
		try {
			const imagesDir = await this._getImagesDirectory();
			if (await this._fileService.exists(imagesDir)) {
				await this._fileService.del(imagesDir, { recursive: true });
			}
		} catch (error) {
			this._logService.warn('Failed to delete images directory:', error);
		}
		
		this._attachedImages = [];
		await this._saveImagesToStorage();
		this._onImagesChanged.fire(this._attachedImages);
	}

	getAttachedImages(): IAttachedImage[] {
		return [...this._attachedImages];
	}

	async checkImageDuplicate(imagePath: string): Promise<boolean> {
		try {
			const imageUri = URI.file(imagePath);
			const imageData = await this._fileService.readFile(imageUri);
			const contentHash = await this.hashBuffer(imageData.value);
			
			// Check against original hashes, not processed hashes
			return this._attachedImages.some(img => img.originalHash === contentHash);
		} catch (error) {
			this._logService.error('Failed to check image duplicate', error);
			return false;
		}
	}

	async getAvailablePlots(): Promise<Array<{ id: string; metadata: any }>> {
		// TODO: Implement integration with Erdos's plot service
		// This requires access to IErdosPlotsService which needs to be injected
		return [];
	}

	private _getMimeType(fileExtension: string): string {
		const mimeTypes: Record<string, string> = {
			'png': 'image/png',
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'gif': 'image/gif',
			'bmp': 'image/bmp',
			'svg': 'image/svg+xml',
			'webp': 'image/webp'
		};
		return mimeTypes[fileExtension] || 'image/png';
	}

	private async _resizeImageIfNeeded(buffer: VSBuffer, mimeType: string): Promise<VSBuffer> {
		// Simple size check - if under limit, return as-is
		if (buffer.byteLength <= this._maxSizeKB * 1024) {
			return buffer;
		}

		// Try to resize using canvas (browser environment)
		try {
			return await this._resizeImageWithCanvas(buffer, mimeType);
		} catch (error) {
			this._logService.warn(`Failed to resize image from ${Math.round(buffer.byteLength / 1024)}KB, returning original:`, error);
			return buffer;
		}
	}

	private async _resizeImageWithCanvas(buffer: VSBuffer, mimeType: string): Promise<VSBuffer> {
		return new Promise((resolve, reject) => {
			// Create image from buffer - ensure we have a proper ArrayBuffer
			const arrayBuffer = buffer.buffer instanceof ArrayBuffer ? buffer.buffer : buffer.buffer.slice();
			const blob = new Blob([arrayBuffer], { type: mimeType });
			const url = URL.createObjectURL(blob);
			const img = new Image();
			
			img.onload = () => {
				URL.revokeObjectURL(url);
				
				// Start with reasonable scaling factors like Rao
				const scaleFactor = this._calculateScaleFactor(buffer.byteLength);
				const newWidth = Math.round(img.width * scaleFactor);
				const newHeight = Math.round(img.height * scaleFactor);
				
				// Don't go below reasonable minimum sizes
				const minSize = 100;
				const finalWidth = Math.max(minSize, newWidth);
				const finalHeight = Math.max(minSize, newHeight);
				
				// Create canvas and resize
				const canvas = document.createElement('canvas');
				canvas.width = finalWidth;
				canvas.height = finalHeight;
				
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Could not get canvas context'));
					return;
				}
				
				// Draw resized image
				ctx.drawImage(img, 0, 0, finalWidth, finalHeight);
				
				// Convert back to buffer with appropriate quality
				const outputFormat = mimeType.includes('jpeg') ? 'image/jpeg' : 'image/png';
				const quality = mimeType.includes('jpeg') ? 0.8 : undefined; // JPEG quality
				
				canvas.toBlob((blob) => {
					if (!blob) {
						reject(new Error('Failed to create blob from canvas'));
						return;
					}
					
					blob.arrayBuffer().then(arrayBuffer => {
						const resizedBuffer = VSBuffer.wrap(new Uint8Array(arrayBuffer));
						const newSizeKB = resizedBuffer.byteLength / 1024;
						
						this._logService.info(`Image resized from ${Math.round(buffer.byteLength / 1024)}KB to ${Math.round(newSizeKB)}KB (${finalWidth}x${finalHeight})`);
						resolve(resizedBuffer);
					}).catch(reject);
				}, outputFormat, quality);
			};
			
			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('Failed to load image for resizing'));
			};
			
			img.src = url;
		});
	}

	private _calculateScaleFactor(sizeBytes: number): number {
		const sizeKB = sizeBytes / 1024;
		const targetKB = this._maxSizeKB;
		
		// Estimate scale factor based on size ratio
		// This is a rough approximation since file size doesn't scale linearly with dimensions
		const ratio = targetKB / sizeKB;
		const scaleFactor = Math.sqrt(ratio * 0.8); // Conservative factor
		
		// Clamp to reasonable range like Rao's scale factors
		return Math.max(0.15, Math.min(0.9, scaleFactor));
	}

	private async _ensureDirectoryExists(dirUri: URI): Promise<void> {
		try {
			await this._fileService.createFolder(dirUri);
		} catch (error) {
			// Directory might already exist, which is fine
			if (error instanceof Error && !error.message.includes('already exists')) {
				throw error;
			}
		}
	}

	private async _generateUniqueFileName(dirUri: URI, originalFileName: string): Promise<string> {
		let fileName = originalFileName;
		let counter = 1;
		
		while (await this._fileService.exists(URI.joinPath(dirUri, fileName))) {
			const parts = CommonUtils.splitNameAndExtension(originalFileName);
			if (parts.extension) {
				fileName = `${parts.name}_${counter}.${parts.extension}`;
			} else {
				fileName = `${originalFileName}_${counter}`;
			}
			counter++;
		}
		
		return fileName;
	}
}
