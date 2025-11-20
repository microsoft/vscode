/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TAB_ACTIVE_FOREGROUND } from '../../../common/theme.js';

export interface IBrowserEditorInputOptions {
	readonly id: string;
	readonly url?: string;
}

export class BrowserEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.browser';

	private readonly _id: string;
	private _url: string;
	private _favicon: string | undefined;
	private _title: string | undefined;
	private _isLoading: boolean = false;

	constructor(
		options: IBrowserEditorInputOptions,
		@IThemeService private readonly _themeService: IThemeService
	) {
		super();
		this._id = options.id;
		this._url = options.url || '';
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
			const color = this._themeService.getColorTheme().getColor(TAB_ACTIVE_FOREGROUND);

			return URI.parse('data:image/svg+xml;utf8,' + encodeURIComponent(`
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
					<path d="M8 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" fill="${color}" opacity="0.3"/>
					<path d="M8 1a7 7 0 0 1 7 7h-1.5A5.5 5.5 0 0 0 8 2.5V1z" fill="${color}">
						<animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" values="0 8 8;360 8 8"/>
					</path>
				</svg>
			`));
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
		try {
			const uri = URI.parse(this._url);
			return uri.authority || 'Browser';
		} catch {
			return 'Browser';
		}
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
}
