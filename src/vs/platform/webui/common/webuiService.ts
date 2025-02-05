/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export interface WebUIOptions {
	readonly enableScripts?: boolean;
	readonly retainContextWhenHidden?: boolean;
}

export const IWebUIService = createDecorator<IWebUIService>('webUIService');

export interface IWebUIService {
	readonly _serviceBrand: undefined;

	/**
	 * Opens the chat in a webview panel within VS Code
	 * @param options WebUI options
	 */
	openChat(options?: WebUIOptions): Promise<void>;
	// Add your service methods here
}
