/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IWebviewManagerService = createDecorator<IWebviewManagerService>('webviewManagerService');

export interface WebviewWebContentsId {
	readonly webContentsId: number;
}

export interface WebviewWindowId {
	readonly windowId: number;
}

export interface FindInFrameOptions {
	readonly forward?: boolean;
	readonly findNext?: boolean;
	readonly matchCase?: boolean;
}

export interface FoundInFrameResult {
	readonly requestId: number;
	readonly activeMatchOrdinal: number;
	readonly matches: number;
	readonly finalUpdate: boolean;
}

export interface IWebviewManagerService {
	_serviceBrand: unknown;

	readonly onFoundInFrame: Event<FoundInFrameResult>;

	setIgnoreMenuShortcuts(id: WebviewWebContentsId | WebviewWindowId, enabled: boolean): Promise<void>;

	// Find in frame
	findInFrame(windowId: WebviewWindowId, frameName: string, text: string, options: FindInFrameOptions): Promise<void>;
	stopFindInFrame(windowId: WebviewWindowId, frameName: string, options: { keepSelection?: boolean }): Promise<void>;

	// Clipboard
	triggerCopy(windowId: WebviewWindowId, frameName: string): Promise<void>;
	triggerPaste(windowId: WebviewWindowId, frameName: string): Promise<void>;
	triggerCut(windowId: WebviewWindowId, frameName: string): Promise<void>;
}
