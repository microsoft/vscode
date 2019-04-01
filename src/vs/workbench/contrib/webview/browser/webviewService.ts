/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IWebviewService = createDecorator<IWebviewService>('webviewService');

export interface IWebviewService {
	_serviceBrand: any;

	createWebview(
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
	): Webview;
}


export interface WebviewPortMapping {
	readonly port: number;
	readonly resolvedPort: number;
}

export interface WebviewOptions {
	readonly allowSvgs?: boolean;
	readonly extension?: {
		readonly location: URI;
		readonly id?: ExtensionIdentifier;
	};
	readonly enableFindWidget?: boolean;
}

export interface WebviewContentOptions {
	readonly allowScripts?: boolean;
	readonly svgWhiteList?: string[];
	readonly localResourceRoots?: ReadonlyArray<URI>;
	readonly portMappings?: ReadonlyArray<WebviewPortMapping>;
}

export interface Webview {

	contents: string;
	options: WebviewContentOptions;
	initialScrollProgress: number;
	state: string | undefined;

	readonly onDidFocus: Event<void>;
	readonly onDidClickLink: Event<URI>;
	readonly onDidScroll: Event<{ scrollYPercentage: number }>;
	readonly onDidUpdateState: Event<string | undefined>;
	readonly onMessage: Event<any>;

	sendMessage(data: any): void;
	update(
		value: string,
		options: WebviewContentOptions,
		retainContextWhenHidden: boolean
	): void;

	layout(): void;
	mountTo(parent: HTMLElement): void;
	focus(): void;
	dispose(): void;

	showFind(): void;
	hideFind(): void;

	reload(): void;
	selectAll(): void;
	copy(): void;
	paste(): void;
	cut(): void;
	undo(): void;
	redo(): void;

	find(value: string, previous: boolean): void;
	startFind(value: string): void;
	stopFind(keepSelection?: boolean): void;
}
