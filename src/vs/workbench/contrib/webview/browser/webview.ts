/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../base/browser/dom.js';
import { IMouseWheelEvent } from '../../../../base/browser/mouseEvent.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { equals } from '../../../../base/common/arrays.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWebviewPortMapping } from '../../../../platform/webview/common/webviewPortMapping.js';
import { Memento, MementoObject } from '../../../common/memento.js';

/**
 * Set when the find widget in a webview in a webview is visible.
 */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE = new RawContextKey<boolean>('webviewFindWidgetVisible', false);

/**
 * Set when the find widget in a webview is focused.
 */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED = new RawContextKey<boolean>('webviewFindWidgetFocused', false);

/**
 * Set when the find widget in a webview is enabled in a webview
 */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABLED = new RawContextKey<boolean>('webviewFindWidgetEnabled', false);

export const IWebviewService = createDecorator<IWebviewService>('webviewService');

export interface IWebviewService {
	readonly _serviceBrand: undefined;

	/**
	 * The currently focused webview.
	 */
	readonly activeWebview: IWebview | undefined;

	/**
	 * All webviews.
	 */
	readonly webviews: Iterable<IWebview>;

	/**
	 * Fired when the currently focused webview changes.
	 */
	readonly onDidChangeActiveWebview: Event<IWebview | undefined>;

	/**
	 * Create a basic webview dom element.
	 */
	createWebviewElement(initInfo: WebviewInitInfo): IWebviewElement;

	/**
	 * Create a lazily created webview element that is overlaid on top of another element.
	 *
	 * Allows us to avoid re-parenting the webview (which destroys its contents) when
	 * moving webview around the workbench.
	 */
	createWebviewOverlay(initInfo: WebviewInitInfo): IOverlayWebview;
}

export interface WebviewInitInfo {
	readonly providedViewType?: string;
	readonly origin?: string;

	readonly title: string | undefined;

	readonly options: WebviewOptions;
	readonly contentOptions: WebviewContentOptions;

	readonly extension: WebviewExtensionDescription | undefined;
}

export const enum WebviewContentPurpose {
	NotebookRenderer = 'notebookRenderer',
	CustomEditor = 'customEditor',
	WebviewView = 'webviewView',
}

export type WebviewStyles = { readonly [key: string]: string | number };

export interface WebviewOptions {
	/**
	 * The purpose of the webview; this is (currently) only used for filtering in js-debug
	 */
	readonly purpose?: WebviewContentPurpose;
	readonly customClasses?: string;
	readonly enableFindWidget?: boolean;

	/**
	 * Disable the service worker used for loading local resources in the webview.
	 */
	readonly disableServiceWorker?: boolean;

	readonly tryRestoreScrollPosition?: boolean;
	readonly retainContextWhenHidden?: boolean;
	transformCssVariables?(styles: WebviewStyles): WebviewStyles;
}

export interface WebviewContentOptions {
	/**
	 * Should the webview allow `acquireVsCodeApi` to be called multiple times? Defaults to false.
	 */
	readonly allowMultipleAPIAcquire?: boolean;

	/**
	 * Should scripts be enabled in the webview? Defaults to false.
	 */
	readonly allowScripts?: boolean;

	/**
	 * Should forms be enabled in the webview? Defaults to the value of {@link allowScripts}.
	 */
	readonly allowForms?: boolean;

	/**
	 * Set of root paths from which the webview can load local resources.
	 */
	readonly localResourceRoots?: readonly URI[];

	/**
	 * Set of localhost port mappings to apply inside the webview.
	 */
	readonly portMapping?: readonly IWebviewPortMapping[];

	/**
	 * Are command uris enabled in the webview? Defaults to false.
	 *
	 * TODO: This is only supported by mainThreadWebviews and should be removed from here.
	 */
	readonly enableCommandUris?: boolean | readonly string[];
}

/**
 * Check if two {@link WebviewContentOptions} are equal.
 */
export function areWebviewContentOptionsEqual(a: WebviewContentOptions, b: WebviewContentOptions): boolean {
	return (
		a.allowMultipleAPIAcquire === b.allowMultipleAPIAcquire
		&& a.allowScripts === b.allowScripts
		&& a.allowForms === b.allowForms
		&& equals(a.localResourceRoots, b.localResourceRoots, isEqual)
		&& equals(a.portMapping, b.portMapping, (a, b) => a.extensionHostPort === b.extensionHostPort && a.webviewPort === b.webviewPort)
		&& areEnableCommandUrisEqual(a, b)
	);
}

function areEnableCommandUrisEqual(a: WebviewContentOptions, b: WebviewContentOptions): boolean {
	if (a.enableCommandUris === b.enableCommandUris) {
		return true;
	}

	if (Array.isArray(a.enableCommandUris) && Array.isArray(b.enableCommandUris)) {
		return equals(a.enableCommandUris, b.enableCommandUris);
	}

	return false;
}

export interface WebviewExtensionDescription {
	readonly location?: URI;
	readonly id: ExtensionIdentifier;
}

export interface WebviewMessageReceivedEvent {
	readonly message: any;
	readonly transfer?: readonly ArrayBuffer[];
}

export interface IWebview extends IDisposable {

	/**
	 * The original view type of the webview.
	 */
	readonly providedViewType?: string;

	/**
	 * The origin this webview itself is loaded from. May not be unique.
	 */
	readonly origin: string;

	/**
	 * Set html content of the webview.
	 */
	setHtml(html: string): void;

	/**
	 * Set the title of the webview. This is set on the webview's iframe element.
	 */
	setTitle(title: string): void;

	/**
	 * Control what content is allowed/blocked inside the webview.
	 */
	contentOptions: WebviewContentOptions;

	/**
	 * List of roots from which local resources can be loaded.
	 *
	 * Requests for local resources not in this list are blocked.
	 */
	localResourcesRoot: readonly URI[];

	/**
	 * The extension that created/owns this webview.
	 */
	extension: WebviewExtensionDescription | undefined;

	initialScrollProgress: number;
	state: string | undefined;

	readonly isFocused: boolean;

	readonly onDidFocus: Event<void>;
	readonly onDidBlur: Event<void>;

	/**
	 * Fired when the webview is disposed of.
	 */
	readonly onDidDispose: Event<void>;

	readonly onDidClickLink: Event<string>;
	readonly onDidScroll: Event<{ readonly scrollYPercentage: number }>;
	readonly onDidWheel: Event<IMouseWheelEvent>;

	readonly onDidUpdateState: Event<string | undefined>;
	readonly onDidReload: Event<void>;

	/**
	 * Fired when the webview cannot be loaded or is now in a non-functional state.
	 */
	readonly onFatalError: Event<{ readonly message: string }>;
	readonly onMissingCsp: Event<ExtensionIdentifier>;

	readonly onMessage: Event<WebviewMessageReceivedEvent>;

	postMessage(message: any, transfer?: readonly ArrayBuffer[]): Promise<boolean>;

	focus(): void;
	reload(): void;

	showFind(animated?: boolean): void;
	hideFind(animated?: boolean): void;
	runFindAction(previous: boolean): void;

	selectAll(): void;
	copy(): void;
	paste(): void;
	cut(): void;
	undo(): void;
	redo(): void;

	windowDidDragStart(): void;
	windowDidDragEnd(): void;

	setContextKeyService(scopedContextKeyService: IContextKeyService): void;
}

/**
 * Basic webview rendered directly in the dom
 */
export interface IWebviewElement extends IWebview {
	/**
	 * Append the webview to a HTML element.
	 *
	 * Note that the webview content will be destroyed if any part of the parent hierarchy
	 * changes. You can avoid this by using a {@link IOverlayWebview} instead.
	 *
	 * @param parent Element to append the webview to.
	 */
	mountTo(parent: HTMLElement, targetWindow: CodeWindow): void;
}

/**
 * Lazily created {@link IWebview} that is absolutely positioned over another element.
 *
 * Absolute positioning lets us avoid having the webview be re-parented, which would destroy the
 * webview's content.
 *
 * Note that the underlying webview owned by a `WebviewOverlay` can be dynamically created
 * and destroyed depending on who has {@link IOverlayWebview.claim claimed} or {@link IOverlayWebview.release released} it.
 */
export interface IOverlayWebview extends IWebview {
	/**
	 * The HTML element that holds the webview.
	 */
	readonly container: HTMLElement;

	origin: string;

	options: WebviewOptions;

	/**
	 * Take ownership of the webview.
	 *
	 * This will create the underlying webview element.
	 *
	 * @param claimant Identifier for the object claiming the webview.
	 *   This must match the `claimant` passed to {@link IOverlayWebview.release}.
	 */
	claim(claimant: any, targetWindow: CodeWindow, scopedContextKeyService: IContextKeyService | undefined): void;

	/**
	 * Release ownership of the webview.
	 *
	 * If the {@link claimant} is still the current owner of the webview, this will
	 * cause the underlying webview element to be destoryed.
	 *
	 * @param claimant Identifier for the object releasing its claim on the webview.
	 *   This must match the `claimant` passed to {@link IOverlayWebview.claim}.
	 */
	release(claimant: any): void;

	/**
	 * Absolutely position the webview on top of another element in the DOM.
	 *
	 * @param element Element to position the webview on top of. This element should
	 *   be an placeholder for the webview since the webview will entirely cover it.
	 * @param dimension Optional explicit dimensions to use for sizing the webview.
	 * @param clippingContainer Optional container to clip the webview to. This should generally be a parent of `element`.
	 */
	layoutWebviewOverElement(element: HTMLElement, dimension?: Dimension, clippingContainer?: HTMLElement): void;
}

/**
 * Stores the unique origins for a webview.
 *
 * These are randomly generated
 */
export class WebviewOriginStore {

	private readonly _memento: Memento;
	private readonly _state: MementoObject;

	constructor(
		rootStorageKey: string,
		@IStorageService storageService: IStorageService,
	) {
		this._memento = new Memento(rootStorageKey, storageService);
		this._state = this._memento.getMemento(StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	public getOrigin(viewType: string, additionalKey: string | undefined): string {
		const key = this._getKey(viewType, additionalKey);

		const existing = this._state[key];
		if (existing && typeof existing === 'string') {
			return existing;
		}

		const newOrigin = generateUuid();
		this._state[key] = newOrigin;
		this._memento.saveMemento();
		return newOrigin;
	}

	private _getKey(viewType: string, additionalKey: string | undefined): string {
		return JSON.stringify({ viewType, key: additionalKey });
	}
}

/**
 * Stores the unique origins for a webview.
 *
 * These are randomly generated, but keyed on extension and webview viewType.
 */
export class ExtensionKeyedWebviewOriginStore {

	private readonly _store: WebviewOriginStore;

	constructor(
		rootStorageKey: string,
		@IStorageService storageService: IStorageService,
	) {
		this._store = new WebviewOriginStore(rootStorageKey, storageService);
	}

	public getOrigin(viewType: string, extId: ExtensionIdentifier): string {
		return this._store.getOrigin(viewType, extId.value);
	}
}
