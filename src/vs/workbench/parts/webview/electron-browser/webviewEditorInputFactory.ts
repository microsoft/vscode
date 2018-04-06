/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInputFactory } from 'vs/workbench/common/editor';
import { IWebviewEditorService, WebviewInputOptions } from './webviewEditorService';
import { WebviewEditorInput } from './webviewEditorInput';

interface SerializedWebview {
	readonly viewType: string;
	readonly title: string;
	readonly options: WebviewInputOptions;
	readonly extensionFolderPath: string;
	readonly state: any;
}

export class WebviewEditorInputFactory implements IEditorInputFactory {

	public static readonly ID = WebviewEditorInput.typeId;

	public constructor(
		@IWebviewEditorService private readonly _webviewService: IWebviewEditorService
	) { }

	public serialize(
		input: WebviewEditorInput
	): string {
		// Has no state, don't revive
		if (!input.state) {
			return null;
		}

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
