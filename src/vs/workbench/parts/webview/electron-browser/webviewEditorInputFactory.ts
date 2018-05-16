/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInputFactory } from 'vs/workbench/common/editor';
import { WebviewEditorInput } from './webviewEditorInput';
import { IWebviewEditorService, WebviewInputOptions } from './webviewEditorService';
import URI from 'vs/base/common/uri';

interface SerializedWebview {
	readonly viewType: string;
	readonly title: string;
	readonly options: WebviewInputOptions;
	/**
	 * compatibility with previous versions
	 */
	readonly extensionFolderPath?: string;
	readonly extensionLocation: string;
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
		if (!input.state || !input.webviewState) {
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
			extensionLocation: input.extensionLocation.toString(),
			state: input.state
		};
		return JSON.stringify(data);
	}

	public deserialize(
		instantiationService: IInstantiationService,
		serializedEditorInput: string
	): WebviewEditorInput {
		const data: SerializedWebview = JSON.parse(serializedEditorInput);
		let extensionLocation: URI;
		if (typeof data.extensionLocation === 'string') {
			extensionLocation = URI.parse(data.extensionLocation);
		}
		if (typeof data.extensionFolderPath === 'string') {
			// compatibility with previous versions
			extensionLocation = URI.file(data.extensionFolderPath);
		}
		return this._webviewService.reviveWebview(data.viewType, data.title, data.state, data.options, extensionLocation);
	}
}
