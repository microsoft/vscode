/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { createDirectoryIfNotExists, IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../../platform/log/common/logService';
import { createServiceIdentifier } from '../../../../util/common/services';
import { Lazy } from '../../../../util/vs/base/common/lazy';
import { ResourceSet } from '../../../../util/vs/base/common/map';
import { URI } from '../../../../util/vs/base/common/uri';

export interface ICopilotCLIImageSupport {
	readonly _serviceBrand: undefined;
	storeImage(imageData: Uint8Array, mimeType: string): Promise<URI>;
	isTrustedImage(imageUri: URI): boolean;
}

export function isImageMimeType(mimeType: string): boolean {
	const map: Record<string, string> = {
		'image/png': '.png',
		'image/jpeg': '.jpg',
		'image/jpg': '.jpg',
		'image/gif': '.gif',
		'image/webp': '.webp',
		'image/bmp': '.bmp',
	};
	return mimeType.toLowerCase() in map;
}

export const ICopilotCLIImageSupport = createServiceIdentifier<ICopilotCLIImageSupport>('ICopilotCLIImageSupport');

export class CopilotCLIImageSupport implements ICopilotCLIImageSupport {
	readonly _serviceBrand: undefined;
	private readonly storageDir: URI;
	private readonly initialized: Lazy<Promise<void>>;
	private readonly trustedImages = new ResourceSet();
	constructor(
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@ILogService private readonly logService: ILogService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
	) {
		this.storageDir = URI.joinPath(this.context.globalStorageUri, 'copilot-cli-images');
		this.initialized = new Lazy<Promise<void>>(() => this.initialize());
		void this.initialized.value;
	}

	private async initialize(): Promise<void> {
		try {
			await createDirectoryIfNotExists(this.fileSystemService, this.storageDir);
			void this.cleanupOldImages();
		} catch (error) {
			this.logService.error(`[CopilotCLISession] ImageStorage: Failed to initialize`, error);
		}
	}

	isTrustedImage(imageUri: URI): boolean {
		return this.trustedImages.has(imageUri);
	}

	async storeImage(imageData: Uint8Array, mimeType: string): Promise<URI> {
		await this.initialized.value;
		const timestamp = Date.now();
		const randomId = Math.random().toString(36).substring(2, 10);
		const extension = this.getExtension(mimeType);
		const filename = `${timestamp}-${randomId}${extension}`;
		const imageUri = URI.file(URI.joinPath(this.storageDir, filename).fsPath);

		await fs.writeFile(imageUri.fsPath, imageData);
		this.trustedImages.add(imageUri);
		return imageUri;
	}

	async cleanupOldImages(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
		try {
			const entries = await fs.readdir(this.storageDir.fsPath, { withFileTypes: true });
			const now = Date.now();
			const cutoff = now - maxAgeMs;

			for (const entry of entries) {
				if (entry.isFile()) {
					const fileUri = URI.joinPath(this.storageDir, entry.name);
					try {
						const stat = await fs.stat(fileUri.fsPath);
						if (stat.mtime.getTime() < cutoff) {
							await fs.unlink(fileUri.fsPath);
						}
					} catch {
						// Skip files we can't access
					}
				}
			}
		} catch (error) {
			console.error('ImageStorage: Failed to cleanup old images', error);
		}
	}

	private getExtension(mimeType: string): string {
		const map: Record<string, string> = {
			'image/png': '.png',
			'image/jpeg': '.jpg',
			'image/jpg': '.jpg',
			'image/gif': '.gif',
			'image/webp': '.webp',
			'image/bmp': '.bmp',
		};
		return map[mimeType.toLowerCase()] || '.bin';
	}
}
