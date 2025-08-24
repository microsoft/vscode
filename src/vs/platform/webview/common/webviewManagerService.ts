/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { VSBuffer } from '../../../base/common/buffer.js';

export const IWebviewManagerService = createDecorator<IWebviewManagerService>('webviewManagerService');

export interface WebviewWebContentsId {
	readonly webContentsId: number;
}

export interface WebviewWindowId {
	readonly windowId: number;
}

export interface WebviewFrameId {
	readonly processId: number;
	readonly routingId: number;
}

export interface FrameNavigationEvent {
	readonly frameId: WebviewFrameId;
	readonly url: string;
}

export interface WebviewRectangle {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
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
	readonly selectionArea: any;
	readonly finalUpdate: boolean;
}

export interface IWebviewManagerService {
	_serviceBrand: unknown;

	onFoundInFrame: Event<FoundInFrameResult>;

	setIgnoreMenuShortcuts(id: WebviewWebContentsId | WebviewWindowId, enabled: boolean): Promise<void>;

	findInFrame(windowId: WebviewWindowId, frameName: string, text: string, options: FindInFrameOptions): Promise<void>;

	stopFindInFrame(windowId: WebviewWindowId, frameName: string, options: { keepSelection?: boolean }): Promise<void>;

	onFrameNavigation: Event<FrameNavigationEvent>;

	captureContentsAsPng(windowId: WebviewWindowId, area?: WebviewRectangle): Promise<VSBuffer | undefined>;

	executeJavaScript(frameId: WebviewFrameId, code: string): Promise<any>;
}
