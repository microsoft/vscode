/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TAB_ACTIVE_FOREGROUND } from '../../../common/theme.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IBrowserViewWorkbenchService, IBrowserViewModel } from '../common/browserView.js';
import { hasKey } from '../../../../base/common/types.js';
import { ILifecycleService, ShutdownReason } from '../../../services/lifecycle/common/lifecycle.js';
import { BrowserEditor } from './browserEditor.js';

const LOADING_SPINNER_SVG = (color: string | undefined) => `
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
		<path d="M8 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" fill="${color}" opacity="0.3"/>
		<path d="M8 1a7 7 0 0 1 7 7h-1.5A5.5 5.5 0 0 0 8 2.5V1z" fill="${color}">
			<animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" values="0 8 8;360 8 8"/>
		</path>
	</svg>
`;

/**
 * JSON-serializable type used during browser state serialization/deserialization
 */
export interface IBrowserEditorInputData {
	readonly id: string;
	readonly url?: string;
	readonly title?: string;
	readonly favicon?: string;
}

export class BrowserEditorInput extends EditorInput {
	static readonly ID = 'workbench.editorinputs.browser';
	private static readonly DEFAULT_LABEL = localize('browser.editorLabel', "Browser");

	private readonly _id: string;
	private readonly _initialData: IBrowserEditorInputData;
	private _model: IBrowserViewModel | undefined;
	private _modelPromise: Promise<IBrowserViewModel> | undefined;

	constructor(
		options: IBrowserEditorInputData,
		@IThemeService private readonly themeService: IThemeService,
		@IBrowserViewWorkbenchService private readonly browserViewWorkbenchService: IBrowserViewWorkbenchService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) {
		super();
		this._id = options.id;
		this._initialData = options;

		this._register(this.lifecycleService.onWillShutdown((e) => {
			if (this._model) {
				// For reloads, we simply hide / re-show the view.
				if (e.reason === ShutdownReason.RELOAD) {
					void this._model.setVisible(false);
				} else {
					this._model.dispose();
					this._model = undefined;
				}
			}
		}));
	}

	get id() {
		return this._id;
	}

	override async resolve(): Promise<IBrowserViewModel> {
		if (!this._model && !this._modelPromise) {
			this._modelPromise = (async () => {
				this._model = await this.browserViewWorkbenchService.getOrCreateBrowserViewModel(this._id);
				this._modelPromise = undefined;

				// Set up cleanup when the model is disposed
				this._register(this._model.onWillDispose(() => {
					this._model = undefined;
				}));

				// Auto-close editor when webcontents closes
				this._register(this._model.onDidClose(() => {
					this.dispose();
				}));

				// Listen for label-relevant changes to fire onDidChangeLabel
				this._register(this._model.onDidChangeTitle(() => this._onDidChangeLabel.fire()));
				this._register(this._model.onDidChangeFavicon(() => this._onDidChangeLabel.fire()));
				this._register(this._model.onDidChangeLoadingState(() => this._onDidChangeLabel.fire()));
				this._register(this._model.onDidNavigate(() => this._onDidChangeLabel.fire()));

				// Navigate to initial URL if provided
				if (this._initialData.url && this._model.url !== this._initialData.url) {
					void this._model.loadURL(this._initialData.url);
				}

				return this._model;
			})();
		}
		return this._model || this._modelPromise!;
	}

	override get typeId(): string {
		return BrowserEditorInput.ID;
	}

	override get editorId(): string {
		return BrowserEditor.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton | EditorInputCapabilities.Readonly;
	}

	override get resource(): URI {
		if (this._resourceBeforeDisposal) {
			return this._resourceBeforeDisposal;
		}

		const url = this._model?.url ?? this._initialData.url ?? '';
		return BrowserViewUri.forUrl(url, this._id);
	}

	override getIcon(): ThemeIcon | URI | undefined {
		// Use model data if available, otherwise fall back to initial data
		if (this._model) {
			if (this._model.loading) {
				const color = this.themeService.getColorTheme().getColor(TAB_ACTIVE_FOREGROUND);
				return URI.parse('data:image/svg+xml;utf8,' + encodeURIComponent(LOADING_SPINNER_SVG(color?.toString())));
			}
			if (this._model.favicon) {
				return URI.parse(this._model.favicon);
			}
			// Model exists but no favicon yet, use default
			return Codicon.globe;
		}
		// Model not created yet, use initial data if available
		if (this._initialData.favicon) {
			return URI.parse(this._initialData.favicon);
		}
		return Codicon.globe;
	}

	override getName(): string {
		// Use model data if available, otherwise fall back to initial data
		if (this._model && this._model.url) {
			if (this._model.title) {
				return this._model.title;
			}
			// Model exists, use its URL for authority
			const authority = URI.parse(this._model.url).authority;
			return authority || BrowserEditorInput.DEFAULT_LABEL;
		}
		// Model not created yet, use initial data
		if (this._initialData.title) {
			return this._initialData.title;
		}
		const url = this._initialData.url ?? '';
		const authority = URI.parse(url).authority;
		return authority || BrowserEditorInput.DEFAULT_LABEL;
	}

	override getDescription(): string | undefined {
		// Use model URL if available, otherwise fall back to initial data
		return this._model ? this._model.url : this._initialData.url;
	}

	override canReopen(): boolean {
		return true;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof BrowserEditorInput) {
			return this._id === otherInput._id;
		}

		// Check if it's an untyped input with a browser view resource
		if (hasKey(otherInput, { resource: true }) && otherInput.resource?.scheme === BrowserViewUri.scheme) {
			const parsed = BrowserViewUri.parse(otherInput.resource);
			if (parsed) {
				return this._id === parsed.id;
			}
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

	// When closing the editor, toUntyped() is called after dispose().
	// So we save a snapshot of the resource so we can still use it after the model is disposed.
	private _resourceBeforeDisposal: URI | undefined;
	override dispose(): void {
		if (this._model) {
			this._resourceBeforeDisposal = this.resource;
			this._model.dispose();
			this._model = undefined;
		}
		super.dispose();
	}

	serialize(): IBrowserEditorInputData {
		return {
			id: this._id,
			url: this._model ? this._model.url : this._initialData.url,
			title: this._model ? this._model.title : this._initialData.title,
			favicon: this._model ? this._model.favicon : this._initialData.favicon
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
