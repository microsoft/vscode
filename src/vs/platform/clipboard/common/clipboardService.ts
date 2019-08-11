/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';

export const IClipboardService = createDecorator<IClipboardService>('clipboardService');

export interface IClipboardService {

	_serviceBrand: any;

	/**
	 * Writes text to the system clipboard.
	 */
	writeText(text: string, type?: string): Promise<void>;

	/**
	 * Reads the content of the clipboard in plain text
	 */
	readText(type?: string): Promise<string>;

	readTextSync(): string | undefined;

	/**
	 * Reads text from the system find pasteboard.
	 */
	readFindText(): string;

	/**
	 * Writes text to the system find pasteboard.
	 */
	writeFindText(text: string): void;

	/**
	 * Writes resources to the system clipboard.
	 */
	writeResources(resources: URI[]): void;

	/**
	 * Reads resources from the system clipboard.
	 */
	readResources(): URI[];

	/**
	 * Find out if resources are copied to the clipboard.
	 */
	hasResources(): boolean;
}
