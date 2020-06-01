/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IWebviewManagerService = createDecorator<IWebviewManagerService>('webviewManagerService');

export interface IWebviewManagerService {
	_serviceBrand: unknown;

	registerWebview(id: string, metadata: RegisterWebviewMetadata): Promise<void>;
	unregisterWebview(id: string): Promise<void>;
	updateLocalResourceRoots(id: string, roots: UriComponents[]): Promise<void>;

	setIgnoreMenuShortcuts(webContentsId: number, enabled: boolean): Promise<void>;
}

export interface RegisterWebviewMetadata {
	readonly extensionLocation: UriComponents | undefined;
	readonly localResourceRoots: readonly UriComponents[];
}
