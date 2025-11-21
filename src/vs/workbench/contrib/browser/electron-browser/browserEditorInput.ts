/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TAB_ACTIVE_FOREGROUND } from '../../../common/theme.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

const LOADING_SPINNER_SVG = (color: string | undefined) => `
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
		<path d="M8 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" fill="${color}" opacity="0.3"/>
		<path d="M8 1a7 7 0 0 1 7 7h-1.5A5.5 5.5 0 0 0 8 2.5V1z" fill="${color}">
			<animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" values="0 8 8;360 8 8"/>
		</path>
	</svg>
`;

export interface IBrowserEditorInputData {
	readonly id: string;
	readonly url?: string;
	readonly title?: string;
	readonly favicon?: string;
	readonly isLoading?: boolean;
}

export class BrowserEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.browser';
	private static readonly DEFAULT_LABEL = localize('browserEditorLabel', "Browser");

	private readonly _id: string;
	private _url: string;
	private _favicon: string | undefined;
	private _title: string | undefined;
	private _isLoading: boolean = false;

	constructor(
		options: IBrowserEditorInputData,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();
		this._id = options.id;
		this._url = options.url || '';
		this._title = options.title;
		this._favicon = options.favicon;
		this._isLoading = options.isLoading ?? false;
	}

	get id(): string {
		return this._id;
	}

	get url(): string {
		return this._url;
	}

	get isLoading(): boolean {
		return this._isLoading;
	}

	setFavicon(favicon: string): void {
		// Notify any listeners that the favicon has changed
		this._favicon = favicon;
		this._onDidChangeLabel.fire();
	}

	setTitle(title: string): void {
		// Notify any listeners that the title has changed
		this._title = title;
		this._onDidChangeLabel.fire();
	}

	setUrl(url: string): void {
		if (this._url !== url) {
			if (URI.parse(this._url).authority !== URI.parse(url).authority) {
				// If the authority (domain) has changed, clear the favicon
				this._favicon = undefined;
			}
			this._url = url;
			this._onDidChangeLabel.fire();
		}
	}

	setLoading(isLoading: boolean): void {
		if (this._isLoading !== isLoading) {
			this._isLoading = isLoading;
			this._onDidChangeLabel.fire();
		}
	}

	override get typeId(): string {
		return BrowserEditorInput.ID;
	}

	override get editorId(): string {
		return BrowserEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton;
	}

	override get resource(): URI {
		return URI.from({
			scheme: Schemas.vscodeBrowser,
			path: this._id,
			query: `url=${encodeURIComponent(this._url)}`
		});
	}

	override getIcon(): ThemeIcon | URI | undefined {
		if (this._isLoading) {
			const color = this.themeService.getColorTheme().getColor(TAB_ACTIVE_FOREGROUND);
			return URI.parse('data:image/svg+xml;utf8,' + encodeURIComponent(LOADING_SPINNER_SVG(color?.toString())));
		}
		if (this._favicon) {
			return URI.parse(this._favicon);
		}
		return Codicon.globe;
	}

	override getName(): string {
		if (this._title) {
			return this._title;
		}
		const authority = URI.parse(this._url).authority;
		return authority || BrowserEditorInput.DEFAULT_LABEL;
	}

	override getDescription(): string | undefined {
		return this._url;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof BrowserEditorInput) {
			return this._id === otherInput._id;
		}

		return false;
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: this.resource,
			options: {
				override: BrowserEditorInput.ID
			}
		};
	}

	serialize(): IBrowserEditorInputData {
		return {
			id: this._id,
			url: this._url,
			title: this._title,
			favicon: this._favicon,
			isLoading: this._isLoading
		};
	}
}

export class BrowserEditorSerializer implements IEditorSerializer {
	canSerialize(editorInput: EditorInput): editorInput is BrowserEditorInput {
		return editorInput instanceof BrowserEditorInput;
	}

	serialize(editorInput: EditorInput): string | undefined {
		if (!this.canSerialize(editorInput)) {
			return undefined;
		}

		return JSON.stringify(editorInput.serialize());
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const data: IBrowserEditorInputData = JSON.parse(serializedEditor);
			return instantiationService.createInstance(BrowserEditorInput, data);
		} catch {
			return undefined;
		}
	}
}
