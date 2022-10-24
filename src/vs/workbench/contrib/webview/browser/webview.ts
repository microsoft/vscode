/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { equals } from 'vs/base/common/arrays';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWebviewPortMapping } from 'vs/platform/webview/common/webviewPortMapping';
import { Memento, MementoObject } from 'vs/workbench/common/memento';

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
	readonly id: string;
	readonly providedViewType?: string;
	readonly origin?: string;

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

export interface IDataLinkClickEvent {
	readonly dataURL: string;
	readonly downloadName?: string;
}

export interface WebviewMessageReceivedEvent {
	readonly message: any;
	readonly transfer?: readonly ArrayBuffer[];
}

export interface IWebview extends IDisposable {

	/**
	 * External identifier of this webview.
	 */
	readonly id: string;

	/**
	 * The origin this webview itself is loaded from. May not be unique
	 */
	readonly origin: string;

	/**
	 * The original view type of the webview.
	 */
	readonly providedViewType?: string;

	html: string;
	contentOptions: WebviewContentOptions;
	localResourcesRoot: readonly URI[];
	extension: WebviewExtensionDescription | undefined;
	initialScrollProgress: number;
	state: string | undefined;

	readonly isFocused: boolean;

	readonly onDidFocus: Event<void>;
	readonly onDidBlur: Event<void>;
	readonly onDidDispose: Event<void>;

	readonly onDidClickLink: Event<string>;
	readonly onDidScroll: Event<{ readonly scrollYPercentage: number }>;
	readonly onDidWheel: Event<IMouseWheelEvent>;
	readonly onDidUpdateState: Event<string | undefined>;
	readonly onDidReload: Event<void>;
	readonly onMessage: Event<WebviewMessageReceivedEvent>;
	readonly onMissingCsp: Event<ExtensionIdentifier>;

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
	mountTo(parent: HTMLElement): void;
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

	options: WebviewOptions;

	/**
	 * Take ownership of the webview.
	 *
	 * This will create the underlying webview element.
	 *
	 * @param claimant Identifier for the object claiming the webview.
	 *   This must match the `claimant` passed to {@link IOverlayWebview.release}.
	 */
	claim(claimant: any, scopedContextKeyService: IContextKeyService | undefined): void;

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

	private readonly memento: Memento;
	private readonly state: MementoObject;

	constructor(
		rootStorageKey: string,
		@IStorageService storageService: IStorageService,
	) {
		this.memento = new Memento(rootStorageKey, storageService);
		this.state = this.memento.getMemento(StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	public getOrigin(viewType: string, additionalKey: string | undefined): string {
		const key = this.getKey(viewType, additionalKey);

		const existing = this.state[key];
		if (existing && typeof existing === 'string') {
			return existing;
		}

		const newOrigin = generateUuid();
		this.state[key] = newOrigin;
		this.memento.saveMemento();
		return newOrigin;
	}

	private getKey(viewType: string, additionalKey: string | undefined): string {
		return JSON.stringify({ viewType, key: additionalKey });
	}
}

/**
 * Stores the unique origins for a webview.
 *
 * These are randomly generated, but keyed on extension and webview viewType.
 */
export class ExtensionKeyedWebviewOriginStore {

	private readonly store: WebviewOriginStore;

	constructor(
		rootStorageKey: string,
		@IStorageService storageService: IStorageService,
	) {
		this.store = new WebviewOriginStore(rootStorageKey, storageService);
	}

	public getOrigin(viewType: string, extId: ExtensionIdentifier): string {
		return this.store.getOrigin(viewType, extId.value);
	}
}
