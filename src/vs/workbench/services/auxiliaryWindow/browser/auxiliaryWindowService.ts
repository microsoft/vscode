/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Dimension, EventHelper, EventType, addDisposableListener, copyAttributes, getClientArea, position, registerWindow, size, trackAttributes } from 'vs/base/browser/dom';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { isWeb } from 'vs/base/common/platform';

export const IAuxiliaryWindowService = createDecorator<IAuxiliaryWindowService>('auxiliaryWindowService');

export interface IAuxiliaryWindowService {

	readonly _serviceBrand: undefined;

	open(): IAuxiliaryWindow;
}

export interface IAuxiliaryWindow extends IDisposable {

	readonly onWillLayout: Event<Dimension>;
	readonly onDidClose: Event<void>;

	readonly container: HTMLElement;

	layout(): void;
}

export type AuxiliaryWindow = Window & typeof globalThis;

export class BrowserAuxiliaryWindowService implements IAuxiliaryWindowService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) { }

	open(): IAuxiliaryWindow {
		const disposables = new DisposableStore();

		const auxiliaryWindow = assertIsDefined(window.open('about:blank')?.window) as AuxiliaryWindow;
		disposables.add(registerWindow(auxiliaryWindow));
		disposables.add(toDisposable(() => auxiliaryWindow.close()));

		this.patchMethods(auxiliaryWindow);

		this.applyMeta(auxiliaryWindow);
		this.applyCSS(auxiliaryWindow, disposables);

		const container = this.applyHTML(auxiliaryWindow, disposables);

		const { onWillLayout, onDidClose } = this.registerListeners(auxiliaryWindow, container, disposables);

		return {
			container,
			onWillLayout: onWillLayout.event,
			onDidClose: onDidClose.event,
			layout: () => onWillLayout.fire(getClientArea(container)),
			dispose: () => disposables.dispose()
		};
	}

	private applyMeta(auxiliaryWindow: AuxiliaryWindow): void {
		const metaCharset = auxiliaryWindow.document.head.appendChild(document.createElement('meta'));
		metaCharset.setAttribute('charset', 'utf-8');

		const originalCSPMetaTag = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
		if (originalCSPMetaTag) {
			const csp = auxiliaryWindow.document.head.appendChild(document.createElement('meta'));
			copyAttributes(originalCSPMetaTag, csp);

			const content = csp.getAttribute('content');
			if (content) {
				csp.setAttribute('content', content.replace(/(script-src[^\;]*)/, `script-src 'none'`));
			}
		}
	}

	protected applyCSS(auxiliaryWindow: AuxiliaryWindow, disposables: DisposableStore): void {
		const mapOriginalToClone = new Map<Node /* original */, Node /* clone */>();

		function cloneNode(originalNode: Node): void {
			const clonedNode = auxiliaryWindow.document.head.appendChild(originalNode.cloneNode(true));
			mapOriginalToClone.set(originalNode, clonedNode);
		}

		// Clone all style elements and stylesheet links from the window to the child window
		for (const originalNode of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
			cloneNode(originalNode);
		}

		// Listen to new stylesheets as they are being added or removed in the main window
		// and apply to child window (including changes to existing stylesheets elements)
		const observer = new MutationObserver(mutations => {
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
		});

		observer.observe(document.head, { childList: true, subtree: true });
		disposables.add(toDisposable(() => observer.disconnect()));
	}

	private applyHTML(auxiliaryWindow: AuxiliaryWindow, disposables: DisposableStore): HTMLElement {

		// Create workbench container and apply classes
		const container = document.createElement('div');
		auxiliaryWindow.document.body.append(container);

		// Track attributes
		disposables.add(trackAttributes(document.documentElement, auxiliaryWindow.document.documentElement));
		disposables.add(trackAttributes(document.body, auxiliaryWindow.document.body));
		disposables.add(trackAttributes(this.layoutService.container, container, ['class'])); // only class attribute

		return container;
	}

	private registerListeners(auxiliaryWindow: AuxiliaryWindow, container: HTMLElement, disposables: DisposableStore): { onWillLayout: Emitter<Dimension>; onDidClose: Emitter<void> } {
		const onDidClose = disposables.add(new Emitter<void>());
		disposables.add(addDisposableListener(auxiliaryWindow, 'unload', () => {
			onDidClose.fire();
		}));

		disposables.add(addDisposableListener(auxiliaryWindow, 'unhandledrejection', e => {
			onUnexpectedError(e.reason);
			e.preventDefault();
		}));

		const onWillLayout = disposables.add(new Emitter<Dimension>());
		disposables.add(addDisposableListener(auxiliaryWindow, EventType.RESIZE, () => {
			const dimension = getClientArea(auxiliaryWindow.document.body);
			position(container, 0, 0, 0, 0, 'relative');
			size(container, dimension.width, dimension.height);

			onWillLayout.fire(dimension);
		}));

		if (isWeb) {
			disposables.add(addDisposableListener(container, EventType.DROP, e => EventHelper.stop(e, true))); 					// Prevent default navigation on drop
			disposables.add(addDisposableListener(container, EventType.WHEEL, e => e.preventDefault(), { passive: false })); 	// Prevent the back/forward gestures in macOS
			disposables.add(addDisposableListener(container, EventType.CONTEXT_MENU, e => EventHelper.stop(e, true))); 			// Prevent native context menus in web
		} else {
			disposables.add(addDisposableListener(auxiliaryWindow.document.body, EventType.DRAG_OVER, (e: DragEvent) => EventHelper.stop(e)));	// Prevent drag feedback on <body>
			disposables.add(addDisposableListener(auxiliaryWindow.document.body, EventType.DROP, (e: DragEvent) => EventHelper.stop(e)));		// Prevent default navigation on drop
		}

		return { onWillLayout, onDidClose };
	}

	protected patchMethods(auxiliaryWindow: AuxiliaryWindow): void {

		// Disallow `createElement` because it would create
		// HTML Elements in the "wrong" context and break
		// code that does "instanceof HTMLElement" etc.
		auxiliaryWindow.document.createElement = function () {
			throw new Error('Not allowed to create elements in child window JavaScript context. Always use the main window so that "xyz instanceof HTMLElement" continues to work.');
		};
	}
}

registerSingleton(IAuxiliaryWindowService, BrowserAuxiliaryWindowService, InstantiationType.Delayed);
