/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { UriComponents } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { MainContext, MainThreadWebviewsShape, WebviewPanelShowOptions } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from '../common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadWebviews)
export class MainThreadWebviews extends Disposable implements MainThreadWebviewsShape {
	$createWebviewPanel(handle: string, viewType: string, title: string, showOptions: WebviewPanelShowOptions, options: modes.IWebviewPanelOptions & modes.IWebviewOptions, extensionId: ExtensionIdentifier, extensionLocation: UriComponents): void {
		throw new Error('Method not implemented.');
	}
	$createWebviewCodeInset(handle: number, symbolId: string, options: modes.IWebviewOptions, extensionId: ExtensionIdentifier | undefined, extensionLocation: UriComponents | undefined): void {
		throw new Error('Method not implemented.');
	}
	$disposeWebview(handle: string): void {
		throw new Error('Method not implemented.');
	}
	$reveal(handle: string, showOptions: WebviewPanelShowOptions): void {
		throw new Error('Method not implemented.');
	}
	$setTitle(handle: string, value: string): void {
		throw new Error('Method not implemented.');
	}
	$setIconPath(handle: string, value: { light: UriComponents; dark: UriComponents; } | undefined): void {
		throw new Error('Method not implemented.');
	}
	$setHtml(handle: string | number, value: string): void {
		throw new Error('Method not implemented.');
	}
	$setOptions(handle: string | number, options: modes.IWebviewOptions): void {
		throw new Error('Method not implemented.');
	}
	$postMessage(handle: string | number, value: any): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	$registerSerializer(viewType: string): void {
		throw new Error('Method not implemented.');
	}
	$unregisterSerializer(viewType: string): void {
		throw new Error('Method not implemented.');
	}
}
