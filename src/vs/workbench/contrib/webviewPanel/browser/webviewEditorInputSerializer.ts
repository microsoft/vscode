/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorSerializer } from '../../../common/editor.js';
import { WebviewContentOptions, WebviewExtensionDescription, WebviewOptions } from '../../webview/browser/webview.js';
import { WebviewIcons, WebviewInput } from './webviewEditorInput.js';
import { IWebviewWorkbenchService } from './webviewWorkbenchService.js';

export type SerializedWebviewOptions = WebviewOptions & WebviewContentOptions;

interface SerializedIconPath {
	light: string | UriComponents;
	dark: string | UriComponents;
}

export interface SerializedWebview {
	readonly origin: string | undefined;
	readonly viewType: string;
	readonly providedId: string | undefined;
	readonly title: string;
	readonly options: SerializedWebviewOptions;
	readonly extensionLocation: UriComponents | undefined;
	readonly extensionId: string | undefined;
	readonly state: any;
	readonly iconPath: SerializedIconPath | undefined;
	readonly group?: number;
}

export interface DeserializedWebview {
	readonly origin: string | undefined;
	readonly viewType: string;
	readonly providedId: string | undefined;
	readonly title: string;
	readonly webviewOptions: WebviewOptions;
	readonly contentOptions: WebviewContentOptions;
	readonly extension: WebviewExtensionDescription | undefined;
	readonly state: any;
	readonly iconPath: WebviewIcons | undefined;
	readonly group?: number;
}

export class WebviewEditorInputSerializer implements IEditorSerializer {

	public static readonly ID = WebviewInput.typeId;

	public constructor(
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService
	) { }

	public canSerialize(input: WebviewInput): boolean {
		return this._webviewWorkbenchService.shouldPersist(input);
	}

	public serialize(input: WebviewInput): string | undefined {
		if (!this.canSerialize(input)) {
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
		const data = this.fromJson(JSON.parse(serializedEditorInput));
		return this._webviewWorkbenchService.openRevivedWebview({
			webviewInitInfo: {
				providedViewType: data.providedId,
				origin: data.origin,
				title: data.title,
				options: data.webviewOptions,
				contentOptions: data.contentOptions,
				extension: data.extension,
			},
			viewType: data.viewType,
			title: data.title,
			iconPath: data.iconPath,
			state: data.state,
			group: data.group
		});
	}

	protected fromJson(data: SerializedWebview): DeserializedWebview {
		return {
			...data,
			extension: reviveWebviewExtensionDescription(data.extensionId, data.extensionLocation),
			iconPath: reviveIconPath(data.iconPath),
			state: reviveState(data.state),
			webviewOptions: restoreWebviewOptions(data.options),
			contentOptions: restoreWebviewContentOptions(data.options),
		};
	}

	protected toJson(input: WebviewInput): SerializedWebview {
		return {
			origin: input.webview.origin,
			viewType: input.viewType,
			providedId: input.providerId,
			title: input.getName(),
			options: { ...input.webview.options, ...input.webview.contentOptions },
			extensionLocation: input.extension?.location,
			extensionId: input.extension?.id.value,
			state: input.webview.state,
			iconPath: input.iconPath ? { light: input.iconPath.light, dark: input.iconPath.dark, } : undefined,
			group: input.group
		};
	}
}

export function reviveWebviewExtensionDescription(
	extensionId: string | undefined,
	extensionLocation: UriComponents | undefined,
): WebviewExtensionDescription | undefined {
	if (!extensionId) {
		return undefined;
	}

	const location = reviveUri(extensionLocation);
	if (!location) {
		return undefined;
	}

	return {
		id: new ExtensionIdentifier(extensionId),
		location,
	};
}

function reviveIconPath(data: SerializedIconPath | undefined) {
	if (!data) {
		return undefined;
	}

	const light = reviveUri(data.light);
	const dark = reviveUri(data.dark);
	return light && dark ? { light, dark } : undefined;
}

function reviveUri(data: string | UriComponents): URI;
function reviveUri(data: string | UriComponents | undefined): URI | undefined;
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

export function restoreWebviewOptions(options: SerializedWebviewOptions): WebviewOptions {
	return options;
}

export function restoreWebviewContentOptions(options: SerializedWebviewOptions): WebviewContentOptions {
	return {
		...options,
		localResourceRoots: options.localResourceRoots?.map(uri => reviveUri(uri)),
	};
}
