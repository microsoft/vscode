/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInputFactory } from 'vs/workbench/common/editor';
import { WebviewEditorInput } from './webviewEditorInput';
import { IWebviewEditorService, WebviewInputOptions } from './webviewEditorService';
import { URI, UriComponents } from 'vs/base/common/uri';

interface SerializedIconPath {
	light: string | UriComponents;
	dark: string | UriComponents;
}

interface SerializedWebview {
	readonly viewType: string;
	readonly id: number;
	readonly title: string;
	readonly options: WebviewInputOptions;
	readonly extensionLocation: string | UriComponents;
	readonly state: any;
	readonly iconPath: SerializedIconPath | undefined;
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
			extensionLocation: input.extensionLocation,
			state: input.state,
			iconPath: input.iconPath ? { light: input.iconPath.light, dark: input.iconPath.dark, } : undefined,
		};

		try {
			return JSON.stringify(data);
		} catch {
			return null;
		}
	}

	public deserialize(
		_instantiationService: IInstantiationService,
		serializedEditorInput: string
	): WebviewEditorInput {
		const data: SerializedWebview = JSON.parse(serializedEditorInput);
		const extensionLocation = reviveUri(data.extensionLocation);
		const iconPath = reviveIconPath(data.iconPath);
		return this._webviewService.reviveWebview(data.viewType, data.id, data.title, iconPath, data.state, data.options, extensionLocation);
	}
}
function reviveIconPath(data: SerializedIconPath | undefined) {
	if (!data) {
		return undefined;
	}

	const light = reviveUri(data.light);
	const dark = reviveUri(data.dark);
	return light && dark ? { light, dark } : undefined;
}

function reviveUri(data: string | UriComponents | undefined): URI | undefined {
	if (!data) {
		return undefined;
	}

	try {
		if (typeof data === 'string') {
			return URI.parse(data);
		}
		return URI.from(data);
	} catch {
		return undefined;
	}
}
