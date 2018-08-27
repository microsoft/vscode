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
	readonly id: number;
	readonly title: string;
	readonly options: WebviewInputOptions;
	readonly extensionLocation: string;
	readonly state: any;
	readonly iconPath: { light: string, dark: string } | undefined;
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
			id: input.getId(),
			title: input.getName(),
			options: input.options,
			extensionLocation: input.extensionLocation.toString(),
			state: input.state,
			iconPath: input.iconPath ? { light: input.iconPath.light.toString(), dark: input.iconPath.dark.toString(), } : undefined,
		};
		return JSON.stringify(data);
	}

	public deserialize(
		_instantiationService: IInstantiationService,
		serializedEditorInput: string
	): WebviewEditorInput {
		const data: SerializedWebview = JSON.parse(serializedEditorInput);
		const extensionLocation = URI.parse(data.extensionLocation);
		const iconPath = data.iconPath ? { light: URI.parse(data.iconPath.light), dark: URI.parse(data.iconPath.dark) } : undefined;
		return this._webviewService.reviveWebview(data.viewType, data.id, data.title, iconPath, data.state, data.options, extensionLocation);
	}
}
