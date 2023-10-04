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
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';

export const IAuxiliaryWindowService = createDecorator<IAuxiliaryWindowService>('auxiliaryWindowService');

export interface IAuxiliaryWindowService {

	readonly _serviceBrand: undefined;

	open(): IAuxiliaryWindow;
}

export interface IAuxiliaryWindow extends IDisposable {

	readonly onDidResize: Event<Dimension>;
	readonly onDidClose: Event<void>;

	readonly container: HTMLElement;
}

export class AuxiliaryWindowService implements IAuxiliaryWindowService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) { }

	open(): IAuxiliaryWindow {
		const disposables = new DisposableStore();

		const auxiliaryWindow = assertIsDefined(window.open('about:blank')?.window);
		disposables.add(registerWindow(auxiliaryWindow));
		disposables.add(toDisposable(() => auxiliaryWindow.close()));

		this.blockMethods(auxiliaryWindow);

		this.applyMeta(auxiliaryWindow);
		this.applyCSS(auxiliaryWindow, disposables);

		const container = this.applyHTML(auxiliaryWindow, disposables);

		const { onDidResize, onDidClose } = this.registerListeners(auxiliaryWindow, container, disposables);

		disposables.add(Event.once(this.lifecycleService.onDidShutdown)(() => disposables.dispose()));
		disposables.add(Event.once(onDidClose.event)(() => disposables.dispose()));

		return {
			container,
			onDidResize: onDidResize.event,
			onDidClose: onDidClose.event,
			dispose: () => disposables.dispose()
		};
	}

	private applyMeta(auxiliaryWindow: Window): void {
		const metaCharset = auxiliaryWindow.document.head.appendChild(document.createElement('meta'));
		metaCharset.setAttribute('charset', 'utf-8');

		const originalCSPMetaTag = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
		if (originalCSPMetaTag) {
			const csp = auxiliaryWindow.document.head.appendChild(document.createElement('meta'));
			copyAttributes(originalCSPMetaTag, csp);
		}
	}

	private applyCSS(auxiliaryWindow: Window, disposables: DisposableStore): void {

		// Clone all style elements and stylesheet links from the window to the child window
		for (const element of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
			auxiliaryWindow.document.head.appendChild(element.cloneNode(true));
		}

		// Running out of sources: listen to new stylesheets as they
		// are being added to the main window and apply to child window
		if (!this.environmentService.isBuilt) {
			const observer = new MutationObserver(mutations => {
				for (const mutation of mutations) {
					if (mutation.type === 'childList') {
						for (const node of mutation.addedNodes) {
							if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'style') {
								auxiliaryWindow.document.head.appendChild(node.cloneNode(true));
							}
						}
					}
				}
			});

			observer.observe(document.head, { childList: true });
			disposables.add(toDisposable(() => observer.disconnect()));
		}
	}

	private applyHTML(auxiliaryWindow: Window, disposables: DisposableStore): HTMLElement {

		// Create workbench container and apply classes
		const container = document.createElement('div');
		auxiliaryWindow.document.body.append(container);

		// Track attributes
		disposables.add(trackAttributes(document.documentElement, auxiliaryWindow.document.documentElement));
		disposables.add(trackAttributes(document.body, auxiliaryWindow.document.body));
		disposables.add(trackAttributes(this.layoutService.container, container, ['class'])); // only class attribute

		return container;
	}

	private registerListeners(auxiliaryWindow: Window & typeof globalThis, container: HTMLElement, disposables: DisposableStore) {
		const onDidClose = disposables.add(new Emitter<void>());
		disposables.add(addDisposableListener(auxiliaryWindow, 'unload', () => {
			onDidClose.fire();
		}));

		disposables.add(addDisposableListener(auxiliaryWindow, 'unhandledrejection', e => {
			onUnexpectedError(e.reason);
			e.preventDefault();
		}));

		const onDidResize = disposables.add(new Emitter<Dimension>());
		disposables.add(addDisposableListener(auxiliaryWindow, EventType.RESIZE, () => {
			const dimension = getClientArea(auxiliaryWindow.document.body);
			position(container, 0, 0, 0, 0, 'relative');
			size(container, dimension.width, dimension.height);

			onDidResize.fire(dimension);
		}));

		if (isWeb) {
			disposables.add(addDisposableListener(container, EventType.DROP, e => EventHelper.stop(e, true))); 					// Prevent default navigation on drop
			disposables.add(addDisposableListener(container, EventType.WHEEL, e => e.preventDefault(), { passive: false })); 	// Prevent the back/forward gestures in macOS
			disposables.add(addDisposableListener(container, EventType.CONTEXT_MENU, e => EventHelper.stop(e, true))); 			// Prevent native context menus in web
		} else {
			disposables.add(addDisposableListener(auxiliaryWindow.document.body, EventType.DRAG_OVER, (e: DragEvent) => EventHelper.stop(e)));	// Prevent drag feedback on <body>
			disposables.add(addDisposableListener(auxiliaryWindow.document.body, EventType.DROP, (e: DragEvent) => EventHelper.stop(e)));		// Prevent default navigation on drop
		}

		return { onDidResize, onDidClose };
	}

	private blockMethods(auxiliaryWindow: Window): void {
		auxiliaryWindow.document.createElement = function () {
			throw new Error('Not allowed to create elements in child window JavaScript context. Always use the main window so that "xyz instanceof HTMLElement" continues to work.');
		};
	}
}

registerSingleton(IAuxiliaryWindowService, AuxiliaryWindowService, InstantiationType.Delayed);
