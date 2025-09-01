/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

export interface IAttachedImage {
	id: string;
	filename: string;
	originalPath: string;
	localPath: string;
	mimeType: string;
	base64Data: string;
	timestamp: string;
	size: number;
	originalHash: string;
}

export const IImageAttachmentService = createDecorator<IImageAttachmentService>('imageAttachmentService');

export interface IImageAttachmentService {
	readonly _serviceBrand: undefined;
	readonly onImagesChanged: Event<IAttachedImage[]>;
	
	attachImage(imagePath: string): Promise<IAttachedImage>;
	attachImageFromFile(file: File): Promise<IAttachedImage>;
	attachPlotFromService(plotId: string): Promise<IAttachedImage | null>;
	removeImage(imageId: string): Promise<void>;
	clearAllImages(): Promise<void>;
	getAttachedImages(): IAttachedImage[];
	getAvailablePlots(): Promise<Array<{ id: string; metadata: any }>>;
}
