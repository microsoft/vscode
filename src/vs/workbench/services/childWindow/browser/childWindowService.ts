/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Dimension, EventType, addDisposableListener, getClientArea, registerWindow } from 'vs/base/browser/dom';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

export const IChildWindowService = createDecorator<IChildWindowService>('childWindowService');

export interface IChildWindowService {

	readonly _serviceBrand: undefined;

	create(): IChildWindow;
}

export interface IChildWindow extends IDisposable {

	readonly onDidResize: Event<Dimension>;
	readonly onDidClose: Event<void>;

	readonly container: HTMLElement;
}

export class ChildWindowService implements IChildWindowService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) { }

	create(): IChildWindow {
		const disposables = new DisposableStore();

		const onDidResize = disposables.add(new Emitter<Dimension>());
		const onDidClose = disposables.add(new Emitter<void>());

		const childWindow = assertIsDefined(window.open('about:blank')?.window);
		disposables.add(registerWindow(childWindow));
		disposables.add(toDisposable(() => childWindow.close()));

		disposables.add(addDisposableListener(childWindow, 'unload', () => {
			onDidClose.fire();
			disposables.dispose();
		}));
		disposables.add(addDisposableListener(childWindow, EventType.RESIZE, () => onDidResize.fire(getClientArea(childWindow.document.body))));

		this.applyMeta(childWindow);
		this.applyCSS(childWindow);

		const container = this.createContainer(childWindow);

		return {
			container,
			onDidResize: onDidResize.event,
			onDidClose: onDidClose.event,
			dispose: () => disposables.dispose()
		};
	}

	private applyMeta(childWindow: Window): void {
		const metaCharset = childWindow.document.head.appendChild(document.createElement('meta'));
		metaCharset.setAttribute('charset', 'utf-8');

		const csp = childWindow.document.head.appendChild(document.createElement('meta'));
		csp.setAttribute('http-equiv', 'Content-Security-Policy');
		csp.setAttribute('content', `
			default-src
				'none'
				;
				img-src
					'self'
					data:
					blob:
					vscode-remote-resource:
					vscode-managed-remote-resource:
					https:
				;
				media-src
					'self'
				;
				frame-src
					'self'
					vscode-webview:
				;
				script-src
					'self'
					'unsafe-eval'
					blob:
				;
				style-src
					'self'
					'unsafe-inline'
				;
				connect-src
					'self'
					https:
					ws:
				;
				font-src
					'self'
					vscode-remote-resource:
					vscode-managed-remote-resource:
				;
				require-trusted-types-for
					'script'
				;
				trusted-types
					amdLoader
					cellRendererEditorText
					defaultWorkerFactory
					diffEditorWidget
					diffReview
					domLineBreaksComputer
					dompurify
					editorGhostText
					editorViewLayer
					notebookRenderer
					stickyScrollViewLayer
					tokenizeToString
				;`
		);
	}

	private applyCSS(childWindow: Window): void {

		// Copy over all stylesheets (TODO@bpasero is there a better way?)
		for (const styleSheet of document.styleSheets) {
			try {
				const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
				const style = document.createElement('style');

				style.textContent = cssRules;
				childWindow.document.head.appendChild(style);
			} catch (e) {
				const link = document.createElement('link');

				link.rel = 'stylesheet';
				link.type = styleSheet.type;
				link.media = styleSheet.media.mediaText;
				link.href = styleSheet.href!;
				childWindow.document.head.appendChild(link);
			}
		}
	}

	private createContainer(childWindow: Window): HTMLElement {

		// TODO@bpasero what if the global classes change?

		// Copy over global classes
		for (const className of window.document.body.className.split(' ')) {
			childWindow.document.body.classList.add(className);
		}

		// Create workbench container and apply classes
		const container = document.createElement('div');
		for (const className of this.layoutService.container.className.split(' ')) {
			container.classList.add(className);
		}
		childWindow.document.body.append(container);

		return container;
	}
}

registerSingleton(IChildWindowService, ChildWindowService, InstantiationType.Delayed);
