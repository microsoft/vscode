/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IClipboardService = createDecorator<IClipboardService>('clipboardService');

export interface IClipboardService {

	readonly _serviceBrand: undefined;

	/**
	 * Trigger the paste. Returns undefined if the paste was not triggered or a promise that resolves on paste end.
	 */
	triggerPaste(targetWindowId: number): Promise<void> | undefined;

	/**
	 * Writes text to the system clipboard.
	 */
	writeText(text: string, type?: string): Promise<void>;

	/**
	 * Reads the content of the clipboard in plain text
	 */
	readText(type?: string): Promise<string>;

	/**
	 * Reads text from the system find pasteboard.
	 */
	readFindText(): Promise<string>;

	/**
	 * Writes text to the system find pasteboard.
	 */
	writeFindText(text: string): Promise<void>;

	/**
	 * Writes resources to the system clipboard.
	 */
	writeResources(resources: URI[]): Promise<void>;

	/**
	 * Reads resources from the system clipboard.
	 */
	readResources(): Promise<URI[]>;

	/**
	 * Find out if resources are copied to the clipboard.
	 */
	hasResources(): Promise<boolean>;

	/**
	 * Resets the internal state of the clipboard (if any) without touching the real clipboard.
	 *
	 * Used for implementations such as web which do not always support using the real clipboard.
	 */
	clearInternalState?(): void;

	/**
	 * Reads resources from the system clipboard as an image. If the clipboard does not contain an
	 * image, an empty buffer is returned.
	 */
	readImage(): Promise<Uint8Array>;
}
