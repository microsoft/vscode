/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { UriComponents } from '../../../base/common/uri.js';
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
	readonly onDidRequestWebviewResource: Event<WebviewResourceRequest>;
	readonly onDidCancelWebviewResource: Event<number>;
	readonly onDidRequestWebviewPortMapping: Event<WebviewPortMappingRequest>;

	registerWebviewDocument(document: WebviewDocumentRegistration): Promise<void>;
	unregisterWebviewDocument(extensionId: string, webviewId: string): Promise<void>;
	startWebviewResourceResponse(response: WebviewResourceResponse): Promise<void>;
	streamWebviewResourceResponse(requestId: number, data: VSBuffer): Promise<void>;
	endWebviewResourceResponse(requestId: number, error?: boolean): Promise<void>;
	resolveWebviewPortMapping(requestId: number, redirect: string | undefined): Promise<void>;

	setIgnoreMenuShortcuts(id: WebviewWebContentsId | WebviewWindowId, enabled: boolean): Promise<void>;

	findInFrame(windowId: WebviewWindowId, frameName: string, text: string, options: FindInFrameOptions): Promise<void>;

	stopFindInFrame(windowId: WebviewWindowId, frameName: string, options: { keepSelection?: boolean }): Promise<void>;
}

export interface WebviewDocumentRegistration {
	readonly extensionId: string;
	readonly webviewId: string;
	readonly windowId: number;
	readonly frameName: string;
	readonly html: string;
	readonly csp: string;
	readonly roots: readonly UriComponents[];
}

export interface WebviewResourceRequest {
	readonly requestId: number;
	readonly extensionId: string;
	readonly webviewId: string;
	readonly method: 'GET' | 'HEAD';
	readonly uri: UriComponents;
	readonly ifNoneMatch: string | undefined;
	readonly range: { readonly start: number; readonly end?: number } | undefined;
}

export interface WebviewResourceResponse {
	readonly requestId: number;
	readonly status: number;
	readonly mime: string | undefined;
	readonly etag: string | undefined;
	readonly mtime: number | undefined;
	readonly size: number | undefined;
	readonly range: string | undefined;
}

export interface WebviewPortMappingRequest {
	readonly requestId: number;
	readonly extensionId: string;
	readonly webviewId: string;
	readonly origin: string;
}
