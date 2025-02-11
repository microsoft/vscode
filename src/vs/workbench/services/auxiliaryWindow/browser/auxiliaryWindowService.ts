/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from '../../../../base/browser/browser.js';
import { Dimension, EventHelper, EventType, ModifierKeyEmitter, addDisposableListener, copyAttributes, createLinkElement, createMetaElement, getActiveWindow, getClientArea, getWindowId, isHTMLElement, position, registerWindow, sharedMutationObserver, trackAttributes } from '../../../../base/browser/dom.js';
import { cloneGlobalStylesheets, isGlobalStylesheet } from '../../../../base/browser/domStylesheets.js';
import { CodeWindow, ensureCodeWindow, mainWindow } from '../../../../base/browser/window.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Barrier } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { mark } from '../../../../base/common/performance.js';
import { isFirefox, isWeb } from '../../../../base/common/platform.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DEFAULT_AUX_WINDOW_SIZE, IRectangle, WindowMinimumSize } from '../../../../platform/window/common/window.js';
import { BaseWindow } from '../../../browser/window.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IHostService } from '../../host/browser/host.js';
import { IWorkbenchLayoutService } from '../../layout/browser/layoutService.js';

export const IAuxiliaryWindowService = createDecorator<IAuxiliaryWindowService>('auxiliaryWindowService');

export interface IAuxiliaryWindowOpenEvent {
	readonly window: IAuxiliaryWindow;
	readonly disposables: DisposableStore;
}

export enum AuxiliaryWindowMode {
	Maximized,
	Normal,
	Fullscreen
}

export interface IAuxiliaryWindowOpenOptions {
	readonly bounds?: Partial<IRectangle>;

	readonly mode?: AuxiliaryWindowMode;
	readonly zoomLevel?: number;

	readonly nativeTitlebar?: boolean;
	readonly disableFullscreen?: boolean;
}

export interface IAuxiliaryWindowService {

	readonly _serviceBrand: undefined;

	readonly onDidOpenAuxiliaryWindow: Event<IAuxiliaryWindowOpenEvent>;

	open(options?: IAuxiliaryWindowOpenOptions): Promise<IAuxiliaryWindow>;

	getWindow(windowId: number): IAuxiliaryWindow | undefined;
}

export interface BeforeAuxiliaryWindowUnloadEvent {
	veto(reason: string | undefined): void;
}

export interface IAuxiliaryWindow extends IDisposable {

	readonly onWillLayout: Event<Dimension>;
	readonly onDidLayout: Event<Dimension>;

	readonly onBeforeUnload: Event<BeforeAuxiliaryWindowUnloadEvent>;
	readonly onUnload: Event<void>;

	readonly whenStylesHaveLoaded: Promise<void>;

	readonly window: CodeWindow;
	readonly container: HTMLElement;

	layout(): void;

	createState(): IAuxiliaryWindowOpenOptions;
}

const DEFAULT_AUX_WINDOW_DIMENSIONS = new Dimension(DEFAULT_AUX_WINDOW_SIZE.width, DEFAULT_AUX_WINDOW_SIZE.height);

export class AuxiliaryWindow extends BaseWindow implements IAuxiliaryWindow {

	private readonly _onWillLayout = this._register(new Emitter<Dimension>());
	readonly onWillLayout = this._onWillLayout.event;

	private readonly _onDidLayout = this._register(new Emitter<Dimension>());
	readonly onDidLayout = this._onDidLayout.event;

	private readonly _onBeforeUnload = this._register(new Emitter<BeforeAuxiliaryWindowUnloadEvent>());
	readonly onBeforeUnload = this._onBeforeUnload.event;

	private readonly _onUnload = this._register(new Emitter<void>());
	readonly onUnload = this._onUnload.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	readonly whenStylesHaveLoaded: Promise<void>;

	constructor(
		readonly window: CodeWindow,
		readonly container: HTMLElement,
		stylesHaveLoaded: Barrier,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHostService hostService: IHostService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		super(window, undefined, hostService, environmentService);

		this.whenStylesHaveLoaded = stylesHaveLoaded.wait().then(() => undefined);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(addDisposableListener(this.window, EventType.BEFORE_UNLOAD, (e: BeforeUnloadEvent) => this.handleBeforeUnload(e)));
		this._register(addDisposableListener(this.window, EventType.UNLOAD, () => this.handleUnload()));

		this._register(addDisposableListener(this.window, 'unhandledrejection', e => {
			onUnexpectedError(e.reason);
			e.preventDefault();
		}));

		this._register(addDisposableListener(this.window, EventType.RESIZE, () => this.layout()));

		this._register(addDisposableListener(this.container, EventType.SCROLL, () => this.container.scrollTop = 0)); 						// Prevent container from scrolling (#55456)

		if (isWeb) {
			this._register(addDisposableListener(this.container, EventType.DROP, e => EventHelper.stop(e, true))); 							// Prevent default navigation on drop
			this._register(addDisposableListener(this.container, EventType.WHEEL, e => e.preventDefault(), { passive: false })); 			// Prevent the back/forward gestures in macOS
			this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, e => EventHelper.stop(e, true))); 					// Prevent native context menus in web
		} else {
			this._register(addDisposableListener(this.window.document.body, EventType.DRAG_OVER, (e: DragEvent) => EventHelper.stop(e)));	// Prevent drag feedback on <body>
			this._register(addDisposableListener(this.window.document.body, EventType.DROP, (e: DragEvent) => EventHelper.stop(e)));		// Prevent default navigation on drop
		}
	}

	private handleBeforeUnload(e: BeforeUnloadEvent): void {

		// Check for veto from a listening component
		let veto: string | undefined;
		this._onBeforeUnload.fire({
			veto(reason) {
				if (reason) {
					veto = reason;
				}
			}
		});
		if (veto) {
			this.handleVetoBeforeClose(e, veto);

			return;
		}

		// Check for confirm before close setting
		const confirmBeforeCloseSetting = this.configurationService.getValue<'always' | 'never' | 'keyboardOnly'>('window.confirmBeforeClose');
		const confirmBeforeClose = confirmBeforeCloseSetting === 'always' || (confirmBeforeCloseSetting === 'keyboardOnly' && ModifierKeyEmitter.getInstance().isModifierPressed);
		if (confirmBeforeClose) {
			this.confirmBeforeClose(e);
		}
	}

	protected handleVetoBeforeClose(e: BeforeUnloadEvent, reason: string): void {
		this.preventUnload(e);
	}

	protected preventUnload(e: BeforeUnloadEvent): void {
		e.preventDefault();
		e.returnValue = localize('lifecycleVeto', "Changes that you made may not be saved. Please check press 'Cancel' and try again.");
	}

	protected confirmBeforeClose(e: BeforeUnloadEvent): void {
		this.preventUnload(e);
	}

	private handleUnload(): void {

		// Event
		this._onUnload.fire();
	}

	layout(): void {

		// Split layout up into two events so that downstream components
		// have a chance to participate in the beginning or end of the
		// layout phase.
		// This helps to build the auxiliary window in another component
		// in the `onWillLayout` phase and then let other compoments
		// react when the overall layout has finished in `onDidLayout`.

		const dimension = getClientArea(this.window.document.body, DEFAULT_AUX_WINDOW_DIMENSIONS, this.container);
		this._onWillLayout.fire(dimension);
		this._onDidLayout.fire(dimension);
	}

	createState(): IAuxiliaryWindowOpenOptions {
		return {
			bounds: {
				x: this.window.screenX,
				y: this.window.screenY,
				width: this.window.outerWidth,
				height: this.window.outerHeight
			},
			zoomLevel: getZoomLevel(this.window)
		};
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}

		this._onWillDispose.fire();

		super.dispose();
	}
}

export class BrowserAuxiliaryWindowService extends Disposable implements IAuxiliaryWindowService {

	declare readonly _serviceBrand: undefined;

	private static readonly DEFAULT_SIZE = DEFAULT_AUX_WINDOW_SIZE;

	private static WINDOW_IDS = getWindowId(mainWindow) + 1; // start from the main window ID + 1

	private readonly _onDidOpenAuxiliaryWindow = this._register(new Emitter<IAuxiliaryWindowOpenEvent>());
	readonly onDidOpenAuxiliaryWindow = this._onDidOpenAuxiliaryWindow.event;

	private readonly windows = new Map<number, IAuxiliaryWindow>();

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IDialogService protected readonly dialogService: IDialogService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IHostService protected readonly hostService: IHostService,
		@IWorkbenchEnvironmentService protected readonly environmentService: IWorkbenchEnvironmentService
	) {
		super();
	}

	async open(options?: IAuxiliaryWindowOpenOptions): Promise<IAuxiliaryWindow> {
		mark('code/auxiliaryWindow/willOpen');

		const targetWindow = await this.openWindow(options);
		if (!targetWindow) {
			throw new Error(localize('unableToOpenWindowError', "Unable to open a new window."));
		}

		// Add a `vscodeWindowId` property to identify auxiliary windows
		const resolvedWindowId = await this.resolveWindowId(targetWindow);
		ensureCodeWindow(targetWindow, resolvedWindowId);

		const containerDisposables = new DisposableStore();
		const { container, stylesLoaded } = this.createContainer(targetWindow, containerDisposables, options);

		const auxiliaryWindow = this.createAuxiliaryWindow(targetWindow, container, stylesLoaded);

		const registryDisposables = new DisposableStore();
		this.windows.set(targetWindow.vscodeWindowId, auxiliaryWindow);
		registryDisposables.add(toDisposable(() => this.windows.delete(targetWindow.vscodeWindowId)));

		const eventDisposables = new DisposableStore();

		Event.once(auxiliaryWindow.onWillDispose)(() => {
			targetWindow.close();

			containerDisposables.dispose();
			registryDisposables.dispose();
			eventDisposables.dispose();
		});

		registryDisposables.add(registerWindow(targetWindow));
		this._onDidOpenAuxiliaryWindow.fire({ window: auxiliaryWindow, disposables: eventDisposables });

		mark('code/auxiliaryWindow/didOpen');

		type AuxiliaryWindowClassification = {
			owner: 'bpasero';
			comment: 'An event that fires when an auxiliary window is opened';
			bounds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Has window bounds provided.' };
		};
		type AuxiliaryWindowOpenEvent = {
			bounds: boolean;
		};
		this.telemetryService.publicLog2<AuxiliaryWindowOpenEvent, AuxiliaryWindowClassification>('auxiliaryWindowOpen', { bounds: !!options?.bounds });

		return auxiliaryWindow;
	}

	protected createAuxiliaryWindow(targetWindow: CodeWindow, container: HTMLElement, stylesLoaded: Barrier): AuxiliaryWindow {
		return new AuxiliaryWindow(targetWindow, container, stylesLoaded, this.configurationService, this.hostService, this.environmentService);
	}

	private async openWindow(options?: IAuxiliaryWindowOpenOptions): Promise<Window | undefined> {
		const activeWindow = getActiveWindow();
		const activeWindowBounds = {
			x: activeWindow.screenX,
			y: activeWindow.screenY,
			width: activeWindow.outerWidth,
			height: activeWindow.outerHeight
		};

		const width = Math.max(options?.bounds?.width ?? BrowserAuxiliaryWindowService.DEFAULT_SIZE.width, WindowMinimumSize.WIDTH);
		const height = Math.max(options?.bounds?.height ?? BrowserAuxiliaryWindowService.DEFAULT_SIZE.height, WindowMinimumSize.HEIGHT);

		let newWindowBounds: IRectangle = {
			x: options?.bounds?.x ?? Math.max(activeWindowBounds.x + activeWindowBounds.width / 2 - width / 2, 0),
			y: options?.bounds?.y ?? Math.max(activeWindowBounds.y + activeWindowBounds.height / 2 - height / 2, 0),
			width,
			height
		};

		if (!options?.bounds && newWindowBounds.x === activeWindowBounds.x && newWindowBounds.y === activeWindowBounds.y) {
			// Offset the new window a bit so that it does not overlap
			// with the active window, unless bounds are provided
			newWindowBounds = {
				...newWindowBounds,
				x: newWindowBounds.x + 30,
				y: newWindowBounds.y + 30
			};
		}

		const features = coalesce([
			'popup=yes',
			`left=${newWindowBounds.x}`,
			`top=${newWindowBounds.y}`,
			`width=${newWindowBounds.width}`,
			`height=${newWindowBounds.height}`,

			// non-standard properties
			options?.nativeTitlebar ? 'window-native-titlebar=yes' : undefined,
			options?.disableFullscreen ? 'window-disable-fullscreen=yes' : undefined,
			options?.mode === AuxiliaryWindowMode.Maximized ? 'window-maximized=yes' : undefined,
			options?.mode === AuxiliaryWindowMode.Fullscreen ? 'window-fullscreen=yes' : undefined
		]);

		const auxiliaryWindow = mainWindow.open(isFirefox ? '' /* FF immediately fires an unload event if using about:blank */ : 'about:blank', undefined, features.join(','));
		if (!auxiliaryWindow && isWeb) {
			return (await this.dialogService.prompt({
				type: Severity.Warning,
				message: localize('unableToOpenWindow', "The browser interrupted the opening of a new window. Press 'Retry' to try again."),
				detail: localize('unableToOpenWindowDetail', "To avoid this problem in the future, please ensure to allow popups for this website."),
				buttons: [
					{
						label: localize({ key: 'retry', comment: ['&& denotes a mnemonic'] }, "&&Retry"),
						run: () => this.openWindow(options)
					}
				],
				cancelButton: true
			})).result;
		}

		return auxiliaryWindow?.window;
	}

	protected async resolveWindowId(auxiliaryWindow: Window): Promise<number> {
		return BrowserAuxiliaryWindowService.WINDOW_IDS++;
	}

	protected createContainer(auxiliaryWindow: CodeWindow, disposables: DisposableStore, options?: IAuxiliaryWindowOpenOptions): { stylesLoaded: Barrier; container: HTMLElement } {
		auxiliaryWindow.document.createElement = function () {
			// Disallow `createElement` because it would create
			// HTML Elements in the "wrong" context and break
			// code that does "instanceof HTMLElement" etc.
			throw new Error('Not allowed to create elements in child window JavaScript context. Always use the main window so that "xyz instanceof HTMLElement" continues to work.');
		};

		this.applyMeta(auxiliaryWindow);
		const { stylesLoaded } = this.applyCSS(auxiliaryWindow, disposables);
		const container = this.applyHTML(auxiliaryWindow, disposables);

		return { stylesLoaded, container };
	}

	private applyMeta(auxiliaryWindow: CodeWindow): void {
		for (const metaTag of ['meta[charset="utf-8"]', 'meta[http-equiv="Content-Security-Policy"]', 'meta[name="viewport"]', 'meta[name="theme-color"]']) {
			const metaElement = mainWindow.document.querySelector(metaTag);
			if (metaElement) {
				const clonedMetaElement = createMetaElement(auxiliaryWindow.document.head);
				copyAttributes(metaElement, clonedMetaElement);

				if (metaTag === 'meta[http-equiv="Content-Security-Policy"]') {
					const content = clonedMetaElement.getAttribute('content');
					if (content) {
						clonedMetaElement.setAttribute('content', content.replace(/(script-src[^\;]*)/, `script-src 'none'`));
					}
				}
			}
		}

		const originalIconLinkTag = mainWindow.document.querySelector('link[rel="icon"]');
		if (originalIconLinkTag) {
			const icon = createLinkElement(auxiliaryWindow.document.head);
			copyAttributes(originalIconLinkTag, icon);
		}
	}

	private applyCSS(auxiliaryWindow: CodeWindow, disposables: DisposableStore) {
		mark('code/auxiliaryWindow/willApplyCSS');

		const mapOriginalToClone = new Map<Node /* original */, Node /* clone */>();

		const stylesLoaded = new Barrier();
		stylesLoaded.wait().then(() => mark('code/auxiliaryWindow/didLoadCSSStyles'));

		const pendingLinksDisposables = disposables.add(new DisposableStore());

		let pendingLinksToSettle = 0;
		function onLinkSettled() {
			if (--pendingLinksToSettle === 0) {
				pendingLinksDisposables.dispose();
				stylesLoaded.open();
			}
		}

		function cloneNode(originalNode: Element): void {
			if (isGlobalStylesheet(originalNode)) {
				return; // global stylesheets are handled by `cloneGlobalStylesheets` below
			}

			const clonedNode = auxiliaryWindow.document.head.appendChild(originalNode.cloneNode(true));
			if (originalNode.tagName.toLowerCase() === 'link') {
				pendingLinksToSettle++;

				pendingLinksDisposables.add(addDisposableListener(clonedNode, 'load', onLinkSettled));
				pendingLinksDisposables.add(addDisposableListener(clonedNode, 'error', onLinkSettled));
			}

			mapOriginalToClone.set(originalNode, clonedNode);
		}

		// Clone all style elements and stylesheet links from the window to the child window
		// and keep track of <link> elements to settle to signal that styles have loaded
		// Increment pending links right from the beginning to ensure we only settle when
		// all style related nodes have been cloned.
		pendingLinksToSettle++;
		try {
			for (const originalNode of mainWindow.document.head.querySelectorAll('link[rel="stylesheet"], style')) {
				cloneNode(originalNode);
			}
		} finally {
			onLinkSettled();
		}

		// Global stylesheets in <head> are cloned in a special way because the mutation
		// observer is not firing for changes done via `style.sheet` API. Only text changes
		// can be observed.
		disposables.add(cloneGlobalStylesheets(auxiliaryWindow));

		// Listen to new stylesheets as they are being added or removed in the main window
		// and apply to child window (including changes to existing stylesheets elements)
		disposables.add(sharedMutationObserver.observe(mainWindow.document.head, disposables, { childList: true, subtree: true })(mutations => {
			for (const mutation of mutations) {
				if (
					mutation.type !== 'childList' ||						// only interested in added/removed nodes
					mutation.target.nodeName.toLowerCase() === 'title' || 	// skip over title changes that happen frequently
					mutation.target.nodeName.toLowerCase() === 'script' || 	// block <script> changes that are unsupported anyway
					mutation.target.nodeName.toLowerCase() === 'meta'		// do not observe <meta> elements for now
				) {
					continue;
				}

				for (const node of mutation.addedNodes) {

					// <style>/<link> element was added
					if (isHTMLElement(node) && (node.tagName.toLowerCase() === 'style' || node.tagName.toLowerCase() === 'link')) {
						cloneNode(node);
					}

					// text-node was changed, try to apply to our clones
					else if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
						const clonedNode = mapOriginalToClone.get(node.parentNode);
						if (clonedNode) {
							clonedNode.textContent = node.textContent;
						}
					}
				}

				for (const node of mutation.removedNodes) {
					const clonedNode = mapOriginalToClone.get(node);
					if (clonedNode) {
						clonedNode.parentNode?.removeChild(clonedNode);
						mapOriginalToClone.delete(node);
					}
				}
			}
		}));

		mark('code/auxiliaryWindow/didApplyCSS');

		return { stylesLoaded };
	}

	private applyHTML(auxiliaryWindow: CodeWindow, disposables: DisposableStore): HTMLElement {
		mark('code/auxiliaryWindow/willApplyHTML');

		// Create workbench container and apply classes
		const container = document.createElement('div');
		container.setAttribute('role', 'application');
		position(container, 0, 0, 0, 0, 'relative');
		container.style.display = 'flex';
		container.style.height = '100%';
		container.style.flexDirection = 'column';
		auxiliaryWindow.document.body.append(container);

		// Track attributes
		disposables.add(trackAttributes(mainWindow.document.documentElement, auxiliaryWindow.document.documentElement));
		disposables.add(trackAttributes(mainWindow.document.body, auxiliaryWindow.document.body));
		disposables.add(trackAttributes(this.layoutService.mainContainer, container, ['class'])); // only class attribute

		mark('code/auxiliaryWindow/didApplyHTML');

		return container;
	}

	getWindow(windowId: number): IAuxiliaryWindow | undefined {
		return this.windows.get(windowId);
	}
}

registerSingleton(IAuxiliaryWindowService, BrowserAuxiliaryWindowService, InstantiationType.Delayed);
