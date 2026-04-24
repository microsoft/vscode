/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { truncate } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IBrowserEditorViewState, IBrowserViewWorkbenchService } from './browserView.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TAB_ACTIVE_FOREGROUND } from '../../../common/theme.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IBrowserViewModel } from '../common/browserView.js';
import { hasKey } from '../../../../base/common/types.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logBrowserOpen } from '../../../../platform/browserView/common/browserViewTelemetry.js';
import { LRUCachedFunction } from '../../../../base/common/cache.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';

const LOADING_SPINNER_SVG = (color: string | undefined) => `
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
		<path d="M8 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" fill="${color}" opacity="0.3"/>
		<path d="M8 1a7 7 0 0 1 7 7h-1.5A5.5 5.5 0 0 0 8 2.5V1z" fill="${color}">
			<animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" values="0 8 8;360 8 8"/>
		</path>
	</svg>
`;

/**
 * Maximum length for browser page titles before truncation
 */
const MAX_TITLE_LENGTH = 30;

/**
 * JSON-serializable type used during browser state serialization/deserialization
 */
export interface IBrowserEditorInputData extends IBrowserEditorViewState {
	readonly id: string;
}

/**
 * Fired before a {@link BrowserEditorInput} is disposed. Listeners may call
 * {@link veto} to prevent disposal and keep the input and its model alive.
 */
export interface IBeforeDisposeBrowserEditorEvent {
	veto(): void;
}

export class BrowserEditorInput extends EditorInput {
	static readonly ID = 'workbench.editorinputs.browser';
	static readonly EDITOR_ID = 'workbench.editor.browser';
	static readonly DEFAULT_LABEL = localize('browser.editorLabel', "Browser");

	private readonly _id: string;
	private _initialData: IBrowserEditorInputData;

	private _model: IBrowserViewModel | undefined;
	private _modelPromise: Promise<IBrowserViewModel> | undefined;
	private _modelStore = this._register(new DisposableStore());

	private readonly _onBeforeDispose = this._register(new Emitter<IBeforeDisposeBrowserEditorEvent>());
	readonly onBeforeDispose: Event<IBeforeDisposeBrowserEditorEvent> = this._onBeforeDispose.event;

	constructor(
		options: IBrowserEditorInputData,
		private _resolveModel: () => Promise<IBrowserViewModel>,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();
		this._id = options.id;
		this._initialData = options;
	}

	get model(): IBrowserViewModel | undefined {
		return this._model;
	}

	set model(model: IBrowserViewModel) {
		if (this._model === model) {
			return;
		}

		this._modelStore.clear();
		this._model = model;

		// Set up cleanup when the model is disposed
		this._modelStore.add(this._model.onWillDispose(() => {
			this._modelStore.clear();
			this._model = undefined;
		}));

		// Auto-close editor when webcontents closes
		this._modelStore.add(this._model.onDidClose(() => {
			this.dispose(true);
		}));

		// Listen for label-relevant changes to fire onDidChangeLabel
		this._modelStore.add(this._model.onDidChangeTitle(() => this._onDidChangeLabel.fire()));
		this._modelStore.add(this._model.onDidChangeFavicon(() => this._onDidChangeLabel.fire()));
		this._modelStore.add(this._model.onDidChangeLoadingState(() => this._onDidChangeLabel.fire()));
		this._modelStore.add(this._model.onDidNavigate(() => this._onDidChangeLabel.fire()));

		this._onDidChangeLabel.fire();
	}

	get id() {
		return this._id;
	}

	get url(): string | undefined {
		// Use model URL if available, otherwise fall back to initial data
		return this._model ? this._model.url : this._initialData.url;
	}

	get title(): string | undefined {
		// Use model title if available, otherwise fall back to initial data
		return this._model ? this._model.title : this._initialData.title;
	}

	get favicon(): string | undefined {
		// Use model favicon if available, otherwise fall back to initial data
		return this._model ? this._model.favicon : this._initialData.favicon;
	}

	navigate(url: string): void {
		if (this._model) {
			void this._model.loadURL(url);
		} else {
			// If the model isn't created yet, update the initial data so that the URL is correct when the model is created
			this._initialData = {
				id: this._id,
				url
			};
			this._onDidChangeLabel.fire();
		}
	}

	override async resolve(): Promise<IBrowserViewModel> {
		if (!this._model && !this._modelPromise) {
			this._modelPromise = (async () => {
				this._model = await this._resolveModel();
				this._modelPromise = undefined;

				return this._model;
			})();
		}
		return this._model || this._modelPromise!;
	}

	override get typeId(): string {
		return BrowserEditorInput.ID;
	}

	override get editorId(): string {
		return BrowserEditorInput.EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.ForceReveal | EditorInputCapabilities.Readonly;
	}

	override get resource(): URI {
		return BrowserViewUri.forId(this._id);
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
		const hasTitle = this._model ? !!this._model.title : !!this._initialData.title;
		const name = hasTitle ? this.title! : this.getDescription(Verbosity.SHORT) || BrowserEditorInput.DEFAULT_LABEL;
		return truncate(name, MAX_TITLE_LENGTH);
	}

	override getTitle(verbosity = Verbosity.MEDIUM): string {
		const hasTitle = this._model ? !!this._model.title : !!this._initialData.title;
		const description = this.getDescription(verbosity);
		const title = hasTitle ? `${this.title} (${description})` : description;
		return title || BrowserEditorInput.DEFAULT_LABEL;
	}

	override getDescription(verbosity = Verbosity.MEDIUM): string | undefined {
		return this.url && this.getURLTitles.get(this.url)[verbosity];
	}

	private readonly getURLTitles = new LRUCachedFunction((url: string) => {
		let _parsed: URI | undefined = undefined;
		let _short: string | undefined = undefined;
		let _medium: string | undefined = undefined;
		let _long: string | undefined = undefined;
		function getParsed() {
			if (!_parsed) {
				_parsed = URI.parse(url);
			}
			return _parsed;
		}
		return {
			get [Verbosity.SHORT]() {
				if (!_short) {
					_short = getParsed().authority;
				}
				return _short;
			},
			get [Verbosity.MEDIUM]() {
				if (!_medium) {
					_medium = getParsed().with({ query: '', fragment: '' }).toString();
				}
				return _medium;
			},
			get [Verbosity.LONG]() {
				if (!_long) {
					_long = getParsed().with({ fragment: '' }).toString();
				}
				return _long;
			}
		};
	});

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

	/**
	 * Creates a copy of this browser editor input with a new unique ID, creating an independent browser view with no linked state.
	 * This is used during Copy into New Window.
	 */
	override copy(): EditorInput {
		logBrowserOpen(this.telemetryService, 'copyToNewWindow');

		return this.instantiationService.invokeFunction((accessor) => {
			const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
			return browserViewWorkbenchService.getOrCreateLazy(generateUuid(), {
				url: this.url,
				title: this.title,
				favicon: this.favicon
			});
		});
	}

	override toUntyped(): IUntypedEditorInput {
		const viewState: IBrowserEditorViewState = {
			url: this.url,
			title: this.title,
			favicon: this.favicon
		};
		return {
			resource: this.resource,
			options: {
				override: BrowserEditorInput.EDITOR_ID,
				viewState
			}
		};
	}

	override dispose(force?: boolean): void {
		if (!force) {
			let vetoed = false;
			this._onBeforeDispose.fire({ veto: () => { vetoed = true; } });
			if (vetoed) {
				return;
			}
		}

		super.dispose(); // Emit `onWillDispose` event first, then clean up the model.
		if (this._model) {
			// `toUntyped()` is called after disposal. Store the latest data in `_initialData` so we can still get them there.
			this._initialData = {
				id: this._id,
				url: this._model.url,
				title: this._model.title,
				favicon: this._model.favicon
			};
			this._model.dispose();
			this._model = undefined;
		}
	}

	serialize(): IBrowserEditorInputData {
		return {
			id: this._id,
			url: this.url,
			title: this.title,
			favicon: this.favicon
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
			return instantiationService.invokeFunction((accessor) => {
				const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
				return browserViewWorkbenchService.getOrCreateLazy(data.id, data);
			});
		} catch {
			return undefined;
		}
	}
}
