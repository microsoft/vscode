/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';

/** The session folder subdirectory the Copilot CLI saves generated images in. */
const GENERATED_IMAGES_DIRECTORY = 'images';

/** Extensions of the image types the CLI saves; other types are not saved. */
const generatedImageExtensions: Readonly<Record<string, string>> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
};

/** An image in a native image generation tool result. */
export interface IGeneratedImage {
	/** The runtime's content-addressed ID, `sha256:` and the SHA-256 of the image bytes. */
	readonly imageId: string;
	readonly mimeType: string;
	/** The base64 the runtime returned, which the CLI derives the file name from. */
	readonly base64: string;
	readonly bytes: VSBuffer;
}

/** A generated image saved to the session folder. */
export interface ISavedGeneratedImage {
	readonly imageId: string;
	readonly path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the images from a native image generation tool result. Only images whose
 * bytes match their image ID are returned, so a saved file is always the image the
 * agent can refer to by that ID.
 */
export function getGeneratedImages(toolResult: unknown): IGeneratedImage[] {
	if (!isRecord(toolResult) || !Array.isArray(toolResult.contents) || !isRecord(toolResult.structuredContent)) {
		return [];
	}
	const contents: unknown[] = toolResult.contents;
	const imageGeneration = toolResult.structuredContent.imageGeneration;
	if (!isRecord(imageGeneration) || !Array.isArray(imageGeneration.images)) {
		return [];
	}
	const images: IGeneratedImage[] = [];
	for (const image of imageGeneration.images) {
		if (!isRecord(image) || typeof image.imageId !== 'string' || typeof image.mimeType !== 'string'
			|| typeof image.contentIndex !== 'number' || !generatedImageExtensions[image.mimeType]) {
			continue;
		}
		const content = contents[image.contentIndex];
		if (!isRecord(content) || content.type !== 'image' || content.mimeType !== image.mimeType || typeof content.data !== 'string' || !content.data) {
			continue;
		}
		let bytes: VSBuffer;
		try {
			bytes = decodeBase64(content.data);
		} catch {
			continue;
		}
		if (`sha256:${createHash('sha256').update(bytes.buffer).digest('hex')}` !== image.imageId) {
			continue;
		}
		images.push({ imageId: image.imageId, mimeType: image.mimeType, base64: content.data, bytes });
	}
	return images;
}

/** The name the Copilot CLI gives the same image, so a session opened in either reuses one file. */
export function getGeneratedImageFileName(image: IGeneratedImage): string {
	return `image-${createHash('sha256').update(image.base64, 'utf8').digest('hex').slice(0, 16)}.${generatedImageExtensions[image.mimeType]}`;
}

/**
 * Saves generated images to the session folder's `images` directory, where the
 * Copilot CLI saves them. An image already saved there is reused, and a different
 * file at its path is left alone. Nothing is saved once the session folder is
 * deleted, so saving never recreates it. Returns the images that were saved.
 */
export async function saveGeneratedImages(images: readonly IGeneratedImage[], sessionDirectory: URI, fileService: IFileService, logService: ILogService): Promise<ISavedGeneratedImage[]> {
	if (!images.length || !await fileService.exists(sessionDirectory)) {
		return [];
	}
	const saved: ISavedGeneratedImage[] = [];
	for (const image of images) {
		const file = URI.joinPath(sessionDirectory, GENERATED_IMAGES_DIRECTORY, getGeneratedImageFileName(image));
		try {
			if (await fileService.exists(file)) {
				const existing = await fileService.readFile(file);
				if (!existing.value.equals(image.bytes)) {
					logService.warn(`[Copilot] Not saving generated image ${image.imageId}: a different file exists at ${file.fsPath}`);
					continue;
				}
			} else {
				const atomic = fileService.hasCapability(file, FileSystemProviderCapabilities.FileAtomicWrite);
				await fileService.writeFile(file, image.bytes, atomic ? { atomic: { postfix: '.tmp' } } : undefined);
			}
			saved.push({ imageId: image.imageId, path: file.fsPath });
		} catch (error) {
			logService.warn(`[Copilot] Could not save generated image ${image.imageId}: ${getErrorMessage(error)}`);
		}
	}
	return saved;
}

/**
 * Adds each saved image's path to the tool's result text, after the line with its
 * image ID, so the agent can copy or open the file rather than look for it.
 */
export function appendGeneratedImagePaths(text: string, saved: readonly ISavedGeneratedImage[]): string {
	const pending = new Map(saved.map(image => [image.imageId, image.path]));
	const lines = text.split('\n').flatMap(line => {
		const imageId = /^image_id: (?<imageId>\S+)$/.exec(line.trim())?.groups?.imageId;
		const path = imageId !== undefined ? pending.get(imageId) : undefined;
		if (imageId === undefined || path === undefined) {
			return [line];
		}
		pending.delete(imageId);
		return [line, `path: ${path}`];
	});
	for (const [imageId, path] of pending) {
		lines.push(`image_id: ${imageId}`, `path: ${path}`);
	}
	return lines.join('\n');
}
