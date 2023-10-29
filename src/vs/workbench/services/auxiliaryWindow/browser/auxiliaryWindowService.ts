/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { mark } from 'vs/base/common/performance';
import { Emitter, Event } from 'vs/base/common/event';
import { Dimension, EventHelper, EventType, addDisposableListener, cloneGlobalStylesheets, copyAttributes, createMetaElement, getActiveWindow, getClientArea, isGlobalStylesheet, position, registerWindow, sharedMutationObserver, size, trackAttributes } from 'vs/base/browser/dom';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { isWeb } from 'vs/base/common/platform';
import { IRectangle } from 'vs/platform/window/common/window';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';

export const IAuxiliaryWindowService = createDecorator<IAuxiliaryWindowService>('auxiliaryWindowService');

export interface IAuxiliaryWindowOpenEvent {
	readonly window: IAuxiliaryWindow;
	readonly disposables: DisposableStore;
}

export interface IAuxiliaryWindowService {

	readonly _serviceBrand: undefined;

	readonly onDidOpenAuxiliaryWindow: Event<IAuxiliaryWindowOpenEvent>;

	open(options?: { position?: IRectangle }): Promise<IAuxiliaryWindow>;
}

export interface IAuxiliaryWindow extends IDisposable {

	readonly onDidLayout: Event<Dimension>;
	readonly onDidClose: Event<void>;

	readonly window: AuxiliaryWindow;
	readonly container: HTMLElement;

	layout(): void;
}

export type AuxiliaryWindow = Window & typeof globalThis & {
	readonly vscodeWindowId: number;
};

export function isAuxiliaryWindow(obj: unknown): obj is AuxiliaryWindow {
	const candidate = obj as AuxiliaryWindow | undefined;

	return !!candidate && Object.hasOwn(candidate, 'vscodeWindowId');
}

export class BrowserAuxiliaryWindowService extends Disposable implements IAuxiliaryWindowService {

	declare readonly _serviceBrand: undefined;

	private static readonly DEFAULT_SIZE = { width: 800, height: 600 };

	private static WINDOW_IDS = 0;

	private readonly _onDidOpenAuxiliaryWindow = this._register(new Emitter<IAuxiliaryWindowOpenEvent>());
	readonly onDidOpenAuxiliaryWindow = this._onDidOpenAuxiliaryWindow.event;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super();
	}

	async open(options?: { position?: IRectangle }): Promise<IAuxiliaryWindow> {
		mark('code/auxiliaryWindow/willOpen');

		const disposables = new DisposableStore();

		const auxiliaryWindow = await this.doOpen(options);
		if (!auxiliaryWindow) {
			throw new Error(localize('unableToOpenWindowError', "Unable to open a new window."));
		}

		disposables.add(registerWindow(auxiliaryWindow));
		disposables.add(toDisposable(() => auxiliaryWindow.close()));

		const { container, onDidLayout, onDidClose } = await this.create(auxiliaryWindow, disposables);

		const result: IAuxiliaryWindow = {
			window: auxiliaryWindow,
			container,
			onDidLayout: onDidLayout.event,
			onDidClose: onDidClose.event,
			layout: () => onDidLayout.fire(getClientArea(container)),
			dispose: () => disposables.dispose()
		};

		const eventDisposables = new DisposableStore();
		disposables.add(eventDisposables);
		this._onDidOpenAuxiliaryWindow.fire({ window: result, disposables: eventDisposables });

		mark('code/auxiliaryWindow/didOpen');

		return result;
	}

	private async doOpen(options?: { position?: IRectangle }): Promise<AuxiliaryWindow | undefined> {
		let position: IRectangle | undefined = options?.position;
		if (!position) {
			const activeWindow = getActiveWindow();
			position = {
				x: activeWindow.screen.availWidth / 2 - BrowserAuxiliaryWindowService.DEFAULT_SIZE.width / 2,
				y: activeWindow.screen.availHeight / 2 - BrowserAuxiliaryWindowService.DEFAULT_SIZE.height / 2,
				width: BrowserAuxiliaryWindowService.DEFAULT_SIZE.width,
				height: BrowserAuxiliaryWindowService.DEFAULT_SIZE.height
			};
		}

		const auxiliaryWindow = window.open('about:blank', undefined, `popup=yes,left=${position.x},top=${position.y},width=${position.width},height=${position.height}`);
		if (!auxiliaryWindow && isWeb) {
			return (await this.dialogService.prompt({
				type: Severity.Warning,
				message: localize('unableToOpenWindow', "The browser interrupted the opening of a new window. Press 'Retry' to try again."),
				detail: localize('unableToOpenWindowDetail', "To avoid this problem in the future, please ensure to allow popups for this website."),
				buttons: [
					{
						label: localize({ key: 'retry', comment: ['&& denotes a mnemonic'] }, "&&Retry"),
						run: () => this.doOpen(options)
					}
				],
				cancelButton: true
			})).result;
		}

		return auxiliaryWindow?.window as AuxiliaryWindow | undefined;
	}

	protected async create(auxiliaryWindow: AuxiliaryWindow, disposables: DisposableStore) {
		await this.patchMethods(auxiliaryWindow);

		this.applyMeta(auxiliaryWindow);
		this.applyCSS(auxiliaryWindow, disposables);

		const container = this.applyHTML(auxiliaryWindow, disposables);

		const { onDidLayout, onDidClose } = this.registerListeners(auxiliaryWindow, container, disposables);

		return { container, onDidLayout, onDidClose };
	}

	private applyMeta(auxiliaryWindow: AuxiliaryWindow): void {
		const metaCharset = createMetaElement(auxiliaryWindow.document.head);
		metaCharset.setAttribute('charset', 'utf-8');

		const originalCSPMetaTag = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
		if (originalCSPMetaTag) {
			const csp = createMetaElement(auxiliaryWindow.document.head);
			copyAttributes(originalCSPMetaTag, csp);

			const content = csp.getAttribute('content');
			if (content) {
				csp.setAttribute('content', content.replace(/(script-src[^\;]*)/, `script-src 'none'`));
			}
		}
	}

	protected applyCSS(auxiliaryWindow: AuxiliaryWindow, disposables: DisposableStore): void {
		mark('code/auxiliaryWindow/willApplyCSS');

		const mapOriginalToClone = new Map<Node /* original */, Node /* clone */>();

		function cloneNode(originalNode: Node): void {
			if (isGlobalStylesheet(originalNode)) {
				return; // global stylesheets are handled by `cloneGlobalStylesheets` below
			}

			const clonedNode = auxiliaryWindow.document.head.appendChild(originalNode.cloneNode(true));
			mapOriginalToClone.set(originalNode, clonedNode);
		}

		// Clone all style elements and stylesheet links from the window to the child window
		for (const originalNode of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
			cloneNode(originalNode);
		}

		// Global stylesheets in <head> are cloned in a special way because the mutation
		// observer is not firing for changes done via `style.sheet` API. Only text changes
		// can be observed.
		disposables.add(cloneGlobalStylesheets(auxiliaryWindow));

		// Listen to new stylesheets as they are being added or removed in the main window
		// and apply to child window (including changes to existing stylesheets elements)
		disposables.add(sharedMutationObserver.observe(document.head, disposables, { childList: true, subtree: true })(mutations => {
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
					if (node instanceof HTMLElement && (node.tagName.toLowerCase() === 'style' || node.tagName.toLowerCase() === 'link')) {
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
	}

	private applyHTML(auxiliaryWindow: AuxiliaryWindow, disposables: DisposableStore): HTMLElement {
		mark('code/auxiliaryWindow/willApplyHTML');

		// Create workbench container and apply classes
		const container = document.createElement('div');
		auxiliaryWindow.document.body.append(container);

		// Track attributes
		disposables.add(trackAttributes(document.documentElement, auxiliaryWindow.document.documentElement));
		disposables.add(trackAttributes(document.body, auxiliaryWindow.document.body));
		disposables.add(trackAttributes(this.layoutService.container, container, ['class'])); // only class attribute

		mark('code/auxiliaryWindow/didApplyHTML');

		return container;
	}

	private registerListeners(auxiliaryWindow: AuxiliaryWindow, container: HTMLElement, disposables: DisposableStore) {
		const onDidClose = disposables.add(new Emitter<void>());
		disposables.add(addDisposableListener(auxiliaryWindow, 'unload', () => {
			onDidClose.fire();
		}));

		disposables.add(addDisposableListener(auxiliaryWindow, 'unhandledrejection', e => {
			onUnexpectedError(e.reason);
			e.preventDefault();
		}));

		const onDidLayout = disposables.add(new Emitter<Dimension>());
		disposables.add(addDisposableListener(auxiliaryWindow, EventType.RESIZE, () => {
			const dimension = getClientArea(auxiliaryWindow.document.body);
			position(container, 0, 0, 0, 0, 'relative');
			size(container, dimension.width, dimension.height);

			onDidLayout.fire(dimension);
		}));

		this._register(addDisposableListener(container, EventType.SCROLL, () => container.scrollTop = 0)); // // Prevent container from scrolling (#55456)

		if (isWeb) {
			disposables.add(addDisposableListener(container, EventType.DROP, e => EventHelper.stop(e, true))); 					// Prevent default navigation on drop
			disposables.add(addDisposableListener(container, EventType.WHEEL, e => e.preventDefault(), { passive: false })); 	// Prevent the back/forward gestures in macOS
			disposables.add(addDisposableListener(container, EventType.CONTEXT_MENU, e => EventHelper.stop(e, true))); 			// Prevent native context menus in web
		} else {
			disposables.add(addDisposableListener(auxiliaryWindow.document.body, EventType.DRAG_OVER, (e: DragEvent) => EventHelper.stop(e)));	// Prevent drag feedback on <body>
			disposables.add(addDisposableListener(auxiliaryWindow.document.body, EventType.DROP, (e: DragEvent) => EventHelper.stop(e)));		// Prevent default navigation on drop
		}

		return { onDidLayout, onDidClose };
	}

	protected async resolveWindowId(auxiliaryWindow: AuxiliaryWindow): Promise<number> {
		return BrowserAuxiliaryWindowService.WINDOW_IDS++;
	}

	protected async patchMethods(auxiliaryWindow: AuxiliaryWindow): Promise<void> {
		mark('code/auxiliaryWindow/willPatchMethods');

		// Add a `vscodeWindowId` property to identify auxiliary windows
		const resolvedWindowId = await this.resolveWindowId(auxiliaryWindow);
		Object.defineProperty(auxiliaryWindow, 'vscodeWindowId', {
			get: () => resolvedWindowId
		});

		// Disallow `createElement` because it would create
		// HTML Elements in the "wrong" context and break
		// code that does "instanceof HTMLElement" etc.
		auxiliaryWindow.document.createElement = function () {
			throw new Error('Not allowed to create elements in child window JavaScript context. Always use the main window so that "xyz instanceof HTMLElement" continues to work.');
		};

		mark('code/auxiliaryWindow/didPatchMethods');
	}
}

registerSingleton(IAuxiliaryWindowService, BrowserAuxiliaryWindowService, InstantiationType.Delayed);
