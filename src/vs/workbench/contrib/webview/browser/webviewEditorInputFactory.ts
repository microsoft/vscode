/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInputFactory } from 'vs/workbench/common/editor';
import { WebviewInput } from './webviewEditorInput';
import { IWebviewEditorService, WebviewInputOptions } from './webviewEditorService';

interface SerializedIconPath {
	light: string | UriComponents;
	dark: string | UriComponents;
}

interface SerializedWebview {
	readonly id?: string;
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

	public static readonly ID = WebviewInput.typeId;

	public constructor(
		@IWebviewEditorService private readonly _webviewService: IWebviewEditorService
	) { }

	public serialize(input: WebviewInput): string | undefined {
		if (!this._webviewService.shouldPersist(input)) {
			return undefined;
		}

		const data = this.toJson(input);
		try {
			return JSON.stringify(data);
		} catch {
			return undefined;
		}
	}

	public deserialize(
		_instantiationService: IInstantiationService,
		serializedEditorInput: string
	): WebviewInput {
		const data = this.fromJson(serializedEditorInput);
		return this._webviewService.reviveWebview(data.id || generateUuid(), data.viewType, data.title, data.iconPath, data.state, data.options, data.extensionLocation ? {
			location: data.extensionLocation,
			id: data.extensionId
		} : undefined, data.group);
	}

	protected fromJson(serializedEditorInput: string) {
		const data: SerializedWebview = JSON.parse(serializedEditorInput);
		return {
			...data,
			extensionLocation: reviveUri(data.extensionLocation),
			extensionId: data.extensionId ? new ExtensionIdentifier(data.extensionId) : undefined,
			iconPath: reviveIconPath(data.iconPath),
			state: reviveState(data.state),
		};
	}

	protected toJson(input: WebviewInput): SerializedWebview {
		return {
			id: input.id,
			viewType: input.viewType,
			title: input.getName(),
			options: { ...input.webview.options, ...input.webview.contentOptions },
			extensionLocation: input.extension ? input.extension.location : undefined,
			extensionId: input.extension && input.extension.id ? input.extension.id.value : undefined,
			state: input.webview.state,
			iconPath: input.iconPath ? { light: input.iconPath.light, dark: input.iconPath.dark, } : undefined,
			group: input.group
		};
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
	return typeof state === 'string' ? state : undefined;
}
