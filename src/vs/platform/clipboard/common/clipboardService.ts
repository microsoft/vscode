/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import URI from 'vs/base/common/uri';

export const IClipboardService = createDecorator<IClipboardService>('clipboardService');

export interface IClipboardService {

	_serviceBrand: any;

	/**
	 * Writes text to the system clipboard.
	 */
	writeText(text: string): void;

	/**
	 * Reads the content of the clipboard in plain text
	 */
	readText(): string;

	/**
	 * Reads text from the system find pasteboard.
	 */
	readFindText(): string;

	/**
	 * Writes text to the system find pasteboard.
	 */
	writeFindText(text: string): void;

	/**
	 * Writes files to the system clipboard.
	 */
	writeFiles(files: URI[]): void;

	/**
	 * Reads files from the system clipboard.
	 */
	readFiles(): URI[];

	/**
	 * Find out if files are copied to the clipboard.
	 */
	hasFiles(): boolean;
}
