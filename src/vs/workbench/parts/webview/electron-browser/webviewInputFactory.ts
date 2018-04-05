/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInputFactory } from 'vs/workbench/common/editor';
import { IWebviewService, WebviewInputOptions } from './webviewService';
import { WebviewEditorInput } from './webviewInput';

interface SerializedWebview {
	readonly viewType: string;
	readonly title: string;
	readonly options: WebviewInputOptions;
	readonly extensionFolderPath: string;
	readonly state: any;
}

export class WebviewInputFactory implements IEditorInputFactory {

	public static readonly ID = WebviewEditorInput.typeId;

	public constructor(
		@IWebviewService private readonly _webviewService: IWebviewService
	) { }

	public serialize(
		input: WebviewEditorInput
	): string {
		// Only attempt revival if we may have a reviver
		if (!this._webviewService.canRevive(input) && !input.reviver) {
			return null;
		}

		const data: SerializedWebview = {
			viewType: input.viewType,
			title: input.getName(),
			options: input.options,
			extensionFolderPath: input.extensionFolderPath.fsPath,
			state: input.state
		};
		return JSON.stringify(data);
	}

	public deserialize(
		instantiationService: IInstantiationService,
		serializedEditorInput: string
	): WebviewEditorInput {
		const data: SerializedWebview = JSON.parse(serializedEditorInput);
		return this._webviewService.reviveWebview(data.viewType, data.title, data.state, data.options, data.extensionFolderPath);
	}
}
