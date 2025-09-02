/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer, encodeBase64 } from '../../../../base/common/buffer.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { IAttachedImage, IImageAttachmentService } from '../common/imageAttachmentService.js';

export class ImageAttachmentService extends Disposable implements IImageAttachmentService {
	readonly _serviceBrand: undefined;
	private readonly _onImagesChanged = this._register(new Emitter<IAttachedImage[]>());
	readonly onImagesChanged: Event<IAttachedImage[]> = this._onImagesChanged.event;

	private _attachedImages: IAttachedImage[] = [];
	private readonly _maxImages = 3;
	private readonly _maxSizeKB = 100;

	private generateId(): string {
		return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
	}

	private async hashBuffer(buffer: VSBuffer): Promise<string> {
		if (typeof crypto !== 'undefined' && crypto.subtle) {
			const hashBuffer = await crypto.subtle.digest('SHA-256', buffer.buffer);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		} else {
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
		@IFileService private readonly _fileService: IFileService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
		@IConversationManager private readonly _conversationManager: IConversationManager,
		@ICommonUtils private readonly commonUtils: ICommonUtils
	) {
		super();
		this._loadImagesFromStorage();
	}

	private async _getImagesDirectory(): Promise<URI> {
		const currentConversation = this._conversationManager.getCurrentConversation();
		const conversationId = currentConversation?.info.id || 1;
		const tempDir = URI.file('/tmp');
		return URI.joinPath(tempDir, 'erdosAi', 'conversations', `conversation_${conversationId}`, 'images_attached');
	}

	private _loadImagesFromStorage(): void {
		try {
			const currentConversation = this._conversationManager.getCurrentConversation();
			const conversationId = currentConversation?.info.id || 1;
			const storageKey = `erdosAi.images.${conversationId}`;
			const imagesData = this._storageService.get(storageKey, /* scope */ 0);
			if (imagesData) {
				const parsedImages = JSON.parse(imagesData);
				
				parsedImages.forEach((img: any) => {
					if (!img.originalHash) {
						img.originalHash = '';
					}
				});
				
				this._attachedImages = parsedImages;
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
			const currentConversation = this._conversationManager.getCurrentConversation();
			const conversationId = currentConversation?.info.id || 1;
			const storageKey = `erdosAi.images.${conversationId}`;
			const serializedData = JSON.stringify(this._attachedImages);
			this._storageService.store(storageKey, serializedData, /* scope */ 0, /* target */ 1);
			
			const stored = this._storageService.get(storageKey, /* scope */ 0);
			if (stored !== serializedData) {
				this._logService.error('Storage verification failed - data was not saved correctly');
			}
		} catch (error) {
			this._logService.error('Failed to save images to storage', error);
			throw error;
		}
	}

	async attachImage(imagePath: string): Promise<IAttachedImage> {
		if (this._attachedImages.length >= this._maxImages) {
			throw new Error(`Only ${this._maxImages} images can be attached.`);
		}

		const imageUri = URI.file(imagePath);
		const imageData = await this._fileService.readFile(imageUri);
		const fileName = this.commonUtils.getBasename(imageUri.path) || 'image.png';
		
		const originalHash = await this.hashBuffer(imageData.value);
		const isDuplicate = this._attachedImages.some(img => img.originalHash === originalHash);
		if (isDuplicate) {
			throw new Error('This image content is already attached.');
		}
		
		const fileExt = this.commonUtils.getFileExtension(fileName).toLowerCase() || 'png';
		const mimeType = this._getMimeType(fileExt);

		const imagesDir = await this._getImagesDirectory();
		await this._ensureDirectoryExists(imagesDir);
		
		const localFileName = await this._generateUniqueFileName(imagesDir, fileName);
		const localPath = URI.joinPath(imagesDir, localFileName);
		
		await this._fileService.copy(imageUri, localPath);

		const resizedData = await this._resizeImageIfNeeded(imageData.value, mimeType);
		const base64Data = encodeBase64(resizedData);

		const attachedImage: IAttachedImage = {
			id: this.generateId(),
			filename: fileName,
			originalPath: imagePath,
			localPath: localPath.fsPath,
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
		if (this._attachedImages.length >= this._maxImages) {
			throw new Error(`Only ${this._maxImages} images can be attached.`);
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = VSBuffer.wrap(new Uint8Array(arrayBuffer));

		const originalHash = await this.hashBuffer(buffer);
		const isDuplicate = this._attachedImages.some(img => img.originalHash === originalHash);
		
		if (isDuplicate) {
			throw new Error('This image content is already attached to the conversation.');
		}

		const resizedData = await this._resizeImageIfNeeded(buffer, file.type);
		const base64Data = encodeBase64(resizedData);

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
		
		await this._saveImagesToStorage();
		
		this._onImagesChanged.fire([...this._attachedImages]);

		return attachedImage;
	}



	async attachPlotFromService(plotId: string): Promise<IAttachedImage | null> {
		this._logService.warn('Plot attachment requires Erdos plots service integration', { plotId });
		return null;
	}

	async removeImage(imageId: string): Promise<void> {
		const index = this._attachedImages.findIndex(img => img.id === imageId);
		if (index >= 0) {
			const image = this._attachedImages[index];
			
			this._attachedImages.splice(index, 1);
			
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
			
			await this._saveImagesToStorage();
			
			this._onImagesChanged.fire([...this._attachedImages]);
		}
	}

	async clearAllImages(): Promise<void> {
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



	async getAvailablePlots(): Promise<Array<{ id: string; metadata: any }>> {
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
		if (buffer.byteLength <= this._maxSizeKB * 1024) {
			return buffer;
		}

		try {
			return await this._resizeImageWithCanvas(buffer, mimeType);
		} catch (error) {
			this._logService.warn(`Failed to resize image from ${Math.round(buffer.byteLength / 1024)}KB, returning original:`, error);
			return buffer;
		}
	}

	private async _resizeImageWithCanvas(buffer: VSBuffer, mimeType: string): Promise<VSBuffer> {
		return new Promise((resolve, reject) => {
			const arrayBuffer = buffer.buffer instanceof ArrayBuffer ? buffer.buffer : buffer.buffer.slice();
			const blob = new Blob([arrayBuffer], { type: mimeType });
			const url = URL.createObjectURL(blob);
			const img = new Image();
			
			img.onload = () => {
				URL.revokeObjectURL(url);
				
				const scaleFactor = this._calculateScaleFactor(buffer.byteLength);
				const newWidth = Math.round(img.width * scaleFactor);
				const newHeight = Math.round(img.height * scaleFactor);
				
				const minSize = 100;
				const finalWidth = Math.max(minSize, newWidth);
				const finalHeight = Math.max(minSize, newHeight);
				
				const canvas = document.createElement('canvas');
				canvas.width = finalWidth;
				canvas.height = finalHeight;
				
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Could not get canvas context'));
					return;
				}
				
				ctx.drawImage(img, 0, 0, finalWidth, finalHeight);
				
				const outputFormat = mimeType.includes('jpeg') ? 'image/jpeg' : 'image/png';
				const quality = mimeType.includes('jpeg') ? 0.8 : undefined;
				
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
		
		const ratio = targetKB / sizeKB;
		const scaleFactor = Math.sqrt(ratio * 0.8);
		
		return Math.max(0.15, Math.min(0.9, scaleFactor));
	}

	private async _ensureDirectoryExists(dirUri: URI): Promise<void> {
		try {
			await this._fileService.createFolder(dirUri);
		} catch (error) {
			if (error instanceof Error && !error.message.includes('already exists')) {
				throw error;
			}
		}
	}

	private async _generateUniqueFileName(dirUri: URI, originalFileName: string): Promise<string> {
		let fileName = originalFileName;
		let counter = 1;
		
		while (await this._fileService.exists(URI.joinPath(dirUri, fileName))) {
			const parts = this.commonUtils.splitNameAndExtension(originalFileName);
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
