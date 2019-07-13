/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInputFactory } from 'vs/workbench/common/editor';
import { WebviewEditorInput } from './webviewEditorInput';
import { IWebviewEditorService, WebviewInputOptions } from './webviewEditorService';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { generateUuid } from 'vs/base/common/uuid';

interface SerializedIconPath {
	light: string | UriComponents;
	dark: string | UriComponents;
}

interface SerializedWebview {
	readonly viewType: string;
	readonly title: string;
	readonly options: WebviewInputOptions;
	readonly extensionLocation: string | UriComponents | undefined;
	readonly extensionId: string | undefined;
	readonly state: any;
	readonly iconPath: SerializedIconPath | undefined;
	readonly group?: number;
}

export class WebviewEditorInputFactory implements IEditorInputFactory {

	public static readonly ID = WebviewEditorInput.typeId;

	public constructor(
		@IWebviewEditorService private readonly _webviewService: IWebviewEditorService
	) { }

	public serialize(
		input: WebviewEditorInput
	): string | undefined {
		if (!this._webviewService.shouldPersist(input)) {
			return undefined;
		}

		const data: SerializedWebview = {
			viewType: input.viewType,
			title: input.getName(),
			options: input.options,
			extensionLocation: input.extension ? input.extension.location : undefined,
			extensionId: input.extension && input.extension.id ? input.extension.id.value : undefined,
			state: input.state,
			iconPath: input.iconPath ? { light: input.iconPath.light, dark: input.iconPath.dark, } : undefined,
			group: input.group
		};

		try {
			return JSON.stringify(data);
		} catch {
			return undefined;
		}
	}

	public deserialize(
		_instantiationService: IInstantiationService,
		serializedEditorInput: string
	): WebviewEditorInput {
		const data: SerializedWebview = JSON.parse(serializedEditorInput);
		const extensionLocation = reviveUri(data.extensionLocation);
		const extensionId = data.extensionId ? new ExtensionIdentifier(data.extensionId) : undefined;
		const iconPath = reviveIconPath(data.iconPath);
		return this._webviewService.reviveWebview(generateUuid(), data.viewType, data.title, iconPath, data.state, data.options, extensionLocation ? {
			location: extensionLocation,
			id: extensionId
		} : undefined, data.group);
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
