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
			options: { ...input.webview.options, ...input.webview.contentOptions },
			extensionLocation: input.extension ? input.extension.location : undefined,
			extensionId: input.extension && input.extension.id ? input.extension.id.value : undefined,
			state: input.webview.state,
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
		const state = reviveState(data.state);

		return this._webviewService.reviveWebview(generateUuid(), data.viewType, data.title, iconPath, state, data.options, extensionLocation ? {
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


function reviveState(state: unknown | undefined): undefined | string {
	if (!state) {
		return undefined;
	}

	if (typeof state === 'string') {
		return state;
	}

	// Likely an old style state. Unwrap to a simple state object
	// Remove after 1.37
	if ('state' in (state as any) && typeof (state as any).state === 'string') {
		return (state as any).state;
	}
	return undefined;
}
