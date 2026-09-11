/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { truncate } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { BrowserViewSharingState, INavigateOptions, IBrowserEditorViewState, IBrowserViewWorkbenchService, BrowserViewEditorId, IBrowserViewResolvedPageSource, IBrowserViewModel } from './browserView.js';
import { EditorInputCapabilities, GroupIdentifier, IEditorSerializer, IMoveResult, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TAB_ACTIVE_FOREGROUND } from '../../../common/theme.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { hasKey } from '../../../../base/common/types.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logBrowserOpen } from '../../../../platform/browserView/common/browserViewTelemetry.js';
import { LRUCachedFunction } from '../../../../base/common/cache.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { isBrowserViewAssociatedResourceNavigation } from '../../../../platform/browserView/common/browserView.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { DeferredPromise } from '../../../../base/common/async.js';

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
	readonly associatedResource?: URI;
	/** Whether the tab came from the default localhost link opener. Not serialized. */
	readonly isDefaultLinkOpen?: boolean;
}

/**
 * Fired before a {@link BrowserEditorInput} is disposed. Listeners may call
 * {@link veto} to prevent disposal and keep the input and its model alive.
 */
export interface IBeforeDisposeBrowserEditorEvent {
	veto(): void;
}

/**
 * Slice both the query and fragment off a raw URL, preserving the exact
 * encoding of the remaining scheme/authority/path.
 */
function stripUrlQueryAndFragment(url: string): string {
	const suffix = url.search(/[?#]/);
	return suffix === -1 ? url : url.slice(0, suffix);
}

interface IBrowserModelResolution {
	readonly result: DeferredPromise<IBrowserViewModel>;
	readonly cancellation: CancellationTokenSource;
}

export class BrowserEditorInput extends EditorInput {
	static readonly ID = 'workbench.editorinputs.browser';
	static readonly EDITOR_ID = BrowserViewEditorId;
	static readonly DEFAULT_LABEL = localize('browser.editorLabel', "Browser");

	private readonly _id: string;
	private readonly _associatedResource: URI | undefined;
	readonly source: URI | undefined;
	private _initialData: IBrowserEditorInputData;

	private _model: IBrowserViewModel | undefined;
	private _modelResolution: IBrowserModelResolution | undefined;
	private readonly _pendingModelResolutions = this._register(new DisposableMap<IBrowserModelResolution>());
	private _modelStore = this._register(new DisposableStore());
	private _isDisposing = false;

	private _resolveError: Error | undefined;
	private _requiresExplicitSourceRetry = false;
	private readonly _onDidChangeResolveError = this._register(new Emitter<Error | undefined>());
	readonly onDidChangeResolveError = this._onDidChangeResolveError.event;

	private readonly _onBeforeDispose = this._register(new Emitter<IBeforeDisposeBrowserEditorEvent>());
	readonly onBeforeDispose: Event<IBeforeDisposeBrowserEditorEvent> = this._onBeforeDispose.event;

	private readonly _onDidResolveModel = this._register(new Emitter<IBrowserViewModel>());
	readonly onDidResolveModel: Event<IBrowserViewModel> = this._onDidResolveModel.event;

	constructor(
		options: IBrowserEditorInputData,
		private readonly _resolveModel: (token: CancellationToken, source?: IBrowserViewResolvedPageSource) => Promise<IBrowserViewModel>,
		@IThemeService private readonly themeService: IThemeService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IBrowserViewWorkbenchService private readonly browserViewWorkbenchService: IBrowserViewWorkbenchService,
	) {
		super();
		if (options.source && options.associatedResource) {
			super.dispose();
			throw new Error('A browser page source cannot also be an associated file resource.');
		}
		this._id = options.id;
		this._associatedResource = options.associatedResource;
		this.source = URI.revive(options.source);
		this._initialData = this.source ? { id: options.id, source: this.source, title: options.title } : options;
		if (this.source) {
			this._register(this.browserViewWorkbenchService.onDidUnregisterPageSourceResolver(scheme => {
				if (this.source?.scheme === scheme) {
					this.invalidateSource(new Error(localize('browser.pageSourceUnavailable', "The page source is no longer available.")));
				}
			}));
		}
	}

	get resolveError(): Error | undefined {
		return this._resolveError;
	}

	get requiresExplicitSourceRetry(): boolean {
		return this._requiresExplicitSourceRetry;
	}

	/** Cancels resolution and discards the current endpoint without closing the resource-backed editor. */
	invalidateSource(error: Error, requiresExplicitRetry = false): void {
		if (!this.source) {
			throw new Error('Only resource-backed browser pages can be invalidated.');
		}
		const resolution = this._modelResolution;
		this._modelResolution = undefined;
		const model = this._model;
		this._model = undefined;
		this._modelStore.clear();
		this._resolveError = error;
		this._requiresExplicitSourceRetry = requiresExplicitRetry;
		if (resolution) {
			void resolution.result.error(error);
			resolution.cancellation.cancel();
		}
		model?.dispose();
		this._onDidChangeLabel.fire();
		if (this._resolveError === error) {
			this._onDidChangeResolveError.fire(error);
		}
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
			if (this.source && model.error?.appPolicyViolation) {
				this.invalidateSource(new Error(model.error.errorDescription), true);
			} else {
				this.dispose(true);
			}
		}));

		// Listen for label-relevant changes to fire onDidChangeLabel
		this._modelStore.add(this._model.onDidChangeTitle(() => this._onDidChangeLabel.fire()));
		this._modelStore.add(this._model.onDidChangeFavicon(() => this._onDidChangeLabel.fire()));
		this._modelStore.add(this._model.onDidChangeLoadingState(() => this._onDidChangeLabel.fire()));
		this._modelStore.add(this._model.onDidNavigate(() => {
			if (!this.source) {
				this._initialData = { ...this._initialData, title: undefined, favicon: undefined };
			}
			this._onDidChangeLabel.fire();
		}));

		this._onDidChangeLabel.fire();
		if (this._model === model && !this.isDisposed()) {
			this._onDidResolveModel.fire(model);
		}
	}

	onceModelResolves(cb: (model: IBrowserViewModel) => void): IDisposable {
		if (this._model) {
			cb(this._model);
			return Disposable.None;
		} else {
			return Event.once(this.onDidResolveModel)(cb);
		}
	}

	get id() {
		return this._id;
	}

	get associatedResource(): URI | undefined {
		return this._associatedResource;
	}

	get url(): string | undefined {
		return this._model?.url || this._initialData.url;
	}

	get title(): string | undefined {
		return this._model?.title || this._initialData.title;
	}

	get favicon(): string | undefined {
		return this._model?.favicon ?? this._initialData.favicon;
	}

	/**
	 * Whether this editor was opened via a default localhost link open (setting
	 * not explicitly configured by the user). Transient — not serialized.
	 */
	get isDefaultLinkOpen(): boolean {
		return !!this._initialData.isDefaultLinkOpen;
	}

	get isSharingAvailable(): boolean {
		return this._model
			? this._model.sharingState === BrowserViewSharingState.Shared || this._model.sharingState === BrowserViewSharingState.Available
			: this.browserViewWorkbenchService.isSharingAvailable;
	}

	navigate(url: string, options?: INavigateOptions): void {
		const destination = url.trim();
		if (this._model) {
			void this._model.loadURL(destination, options);
		} else {
			if (this.source) {
				throw new Error(localize('browser.pageSourceNotResolved', "Resolve the page source before navigating."));
			}
			this._initialData = {
				id: this._id,
				url: destination
			};
			this._onDidChangeLabel.fire();
		}
	}

	override async resolve(): Promise<IBrowserViewModel> {
		if (this.isDisposed() || this._isDisposing) {
			throw new CancellationError();
		}
		if (this._model) {
			return this._model;
		}
		let resolution = this._modelResolution;
		if (!resolution) {
			const attempt: IBrowserModelResolution = {
				result: new DeferredPromise<IBrowserViewModel>(),
				cancellation: new CancellationTokenSource(),
			};
			this._pendingModelResolutions.set(attempt, toDisposable(() => {
				if (!attempt.result.isSettled) {
					void attempt.result.cancel();
					attempt.cancellation.cancel();
				}
				attempt.cancellation.dispose();
			}));
			this._modelResolution = resolution = attempt;
			void this.resolveModel(attempt);
		}
		return resolution.result.p;
	}

	private isCurrentResolution(resolution: IBrowserModelResolution): boolean {
		return this._modelResolution === resolution && !this.isDisposed() && !this._isDisposing && !resolution.cancellation.token.isCancellationRequested;
	}

	private async resolveModel(resolution: IBrowserModelResolution): Promise<void> {
		const token = resolution.cancellation.token;
		try {
			this._resolveError = undefined;
			this._requiresExplicitSourceRetry = false;
			this._onDidChangeResolveError.fire(undefined);
			if (!this.isCurrentResolution(resolution)) {
				throw new CancellationError();
			}
			const source = this.source ? await this.browserViewWorkbenchService.resolvePageSource(this.source, token) : undefined;
			if (!this.isCurrentResolution(resolution)) {
				throw new CancellationError();
			}
			const model = await this._resolveModel(token, source);
			if (!this.isCurrentResolution(resolution)) {
				model.dispose();
				throw new CancellationError();
			}
			this.model = model;
			if (!this.isCurrentResolution(resolution)) {
				throw new CancellationError();
			}
			void resolution.result.complete(model);
		} catch (error) {
			if (!this.isCurrentResolution(resolution)) {
				void resolution.result.cancel();
			} else if (!this.source) {
				void resolution.result.error(error);
			} else {
				const resolveError = isCancellationError(error)
					? new Error(localize('browser.pageSourceCancelled', "Page source resolution was cancelled."), { cause: error })
					: error instanceof Error ? error : new Error(localize('browser.pageSourceFailed', "Unable to resolve the page source."), { cause: error });
				this._resolveError = resolveError;
				this._onDidChangeResolveError.fire(resolveError);
				void resolution.result.error(resolveError);
			}
		} finally {
			if (this._modelResolution === resolution) {
				this._modelResolution = undefined;
			}
			this._pendingModelResolutions.deleteAndDispose(resolution);
		}
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

	get preferredResource(): URI {
		return this._associatedResource ?? this.resource;
	}

	override getIcon(): ThemeIcon | URI | undefined {
		const defaultIcon = this._associatedResource ? undefined : Codicon.globe;

		if (this._model) {
			if (this._model.loading) {
				const color = this.themeService.getColorTheme().getColor(TAB_ACTIVE_FOREGROUND);
				return URI.parse('data:image/svg+xml;utf8,' + encodeURIComponent(LOADING_SPINNER_SVG(color?.toString())));
			}
			if (this._model.favicon) {
				return URI.parse(this._model.favicon);
			}
		}
		if (this._initialData.favicon) {
			return URI.parse(this._initialData.favicon);
		}
		return defaultIcon;
	}

	override getName(): string {
		if (this.title) {
			return truncate(this.title!, MAX_TITLE_LENGTH);
		}

		const name = this._associatedResource ? basename(this._associatedResource) : !this.source && this.url && this.getURLTitles.get(this.url)[Verbosity.SHORT] || BrowserEditorInput.DEFAULT_LABEL;
		return truncate(name, MAX_TITLE_LENGTH);
	}

	override getTitle(verbosity = Verbosity.MEDIUM): string {
		const description = this.getDescription(verbosity);
		const title = this.title ? `${this.title} (${description})` : description;
		return title || BrowserEditorInput.DEFAULT_LABEL;
	}

	override getDescription(verbosity = Verbosity.MEDIUM): string | undefined {
		if (this.source) {
			return stripUrlQueryAndFragment(this.source.toString());
		}
		return this.url && this.getURLTitles.get(this.url)[verbosity];
	}

	private readonly getURLTitles = new LRUCachedFunction((url: string) => {
		let _short: string | undefined = undefined;
		let _mediumlong: string | undefined = undefined;
		const mediumlong = () => {
			if (_mediumlong === undefined) {
				_mediumlong = stripUrlQueryAndFragment(url);
			}
			return _mediumlong;
		};
		return {
			// Host only for network URLs, path only for file URLs.
			get [Verbosity.SHORT]() {
				if (_short === undefined) {
					const parsed = URL.parse(url);
					_short = parsed ? parsed.protocol === 'file:' ? parsed.pathname : parsed.host : stripUrlQueryAndFragment(url);
				}
				return _short;
			},
			// Raw URL without the query/fragment. Computed by string slicing
			// (not a URI round-trip) so the displayed text stays byte-for-byte
			// consistent with the canonical URL shown in the navbar.
			get [Verbosity.MEDIUM]() {
				return mediumlong();
			},
			// Raw URL without the query/fragment.
			get [Verbosity.LONG]() {
				return mediumlong();
			}
		};
	});

	override canReopen(): boolean {
		return true;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this._associatedResource && !(otherInput instanceof EditorInput) && hasKey(otherInput, { resource: true }) && isEqual(this._associatedResource, otherInput.resource)) {
			return otherInput.options?.override === BrowserEditorInput.EDITOR_ID;
		}

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

		return this.browserViewWorkbenchService.getOrCreateLazy({
			...this.serialize(),
			id: generateUuid()
		});
	}

	private getViewState(): IBrowserEditorViewState {
		if (this.source) {
			return { source: this.source, title: this._initialData.title };
		}
		return {
			url: this.url,
			title: this.title,
			favicon: this.favicon
		};
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: this.preferredResource,
			options: {
				override: BrowserEditorInput.EDITOR_ID,
				viewState: this.getViewState()
			}
		};
	}

	override async rename(_group: GroupIdentifier, target: URI): Promise<IMoveResult | undefined> {
		if (!this._associatedResource) {
			return undefined;
		}

		const currentUrl = this.url;
		let renamedUrl = currentUrl;
		if (currentUrl && isBrowserViewAssociatedResourceNavigation(this._associatedResource, currentUrl)) {
			const currentResource = URI.parse(currentUrl);
			renamedUrl = target.with({ query: currentResource.query, fragment: currentResource.fragment }).toString();
		}
		return {
			editor: {
				resource: target,
				options: {
					override: BrowserEditorInput.EDITOR_ID,
					viewState: {
						url: renamedUrl,
						title: this.title,
						favicon: this.favicon
					}
				}
			}
		};
	}

	override dispose(force?: boolean): void {
		if (this.isDisposed() || this._isDisposing) {
			return;
		}
		if (!force) {
			let vetoed = false;
			this._onBeforeDispose.fire({ veto: () => { vetoed = true; } });
			if (vetoed) {
				return;
			}
		}

		this._isDisposing = true;
		this._modelResolution = undefined;
		this._initialData = this.serialize();
		const model = this._model;
		super.dispose(); // Emit `onWillDispose` event first, then clean up the model.
		model?.dispose();
		this._model = undefined;
	}

	serialize(): IBrowserEditorInputData {
		return {
			id: this._id,
			associatedResource: this._associatedResource,
			...this.getViewState()
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
				return browserViewWorkbenchService.getOrCreateLazy({
					id: data.id,
					source: URI.revive(data.source),
					url: data.url,
					title: data.title,
					favicon: data.favicon,
					associatedResource: URI.revive(data.associatedResource)
				});
			});
		} catch {
			return undefined;
		}
	}
}
