/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosModalReactRenderer.css';

import React, { ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

import * as DOM from './dom.js';
import { Emitter } from '../common/event.js';
import { Disposable } from '../common/lifecycle.js';
import { StandardKeyboardEvent } from './keyboardEvent.js';
import { ErdosReactServices } from './erdosReactServices.js';
import { ErdosReactServicesContext } from './erdosReactRendererContext.js';
import { ResultKind } from '../../platform/keybinding/common/keybindingResolver.js';

const ALLOWABLE_COMMANDS = [
	'copy',
	'cut',
	'undo',
	'redo',
	'editor.action.selectAll',
	'editor.action.clipboardCopyAction',
	'editor.action.clipboardCutAction',
	'editor.action.clipboardPasteAction',
	'workbench.action.quit',
	'workbench.action.reloadWindow'
];

const KEYDOWN = 'keydown';
const MOUSEDOWN = 'mousedown';
const RESIZE = 'resize';

interface ErdosModalReactRendererOptions {
	container?: HTMLElement;
	parent?: HTMLElement;
	onDisposed?: () => void;
	disableCaptures?: boolean;
}

export class ErdosModalReactRenderer extends Disposable {
	private static readonly _renderersStack = new Set<ErdosModalReactRenderer>();
	private static _unbindCallback?: () => void;

	private readonly _lastFocusedElement: HTMLElement | undefined;
	private _overlay?: HTMLElement;
	private _root?: Root;

	private readonly _onKeyDownEmitter = this._register(new Emitter<KeyboardEvent>);
	private readonly _onMouseDownEmitter = this._register(new Emitter<MouseEvent>);
	private readonly _onResizeEmitter = this._register(new Emitter<UIEvent>);

	constructor(private readonly _options: ErdosModalReactRendererOptions = {}) {
		super();

		if (!_options.container) {
			_options.container = ErdosReactServices.services.workbenchLayoutService.activeContainer;
		}

		let activeElement: Element | null = null;
		if (_options.parent) {
			activeElement = DOM.getWindow(_options.parent).document.activeElement;
		}
		if (!activeElement) {
			activeElement = DOM.getActiveWindow().document.activeElement;
		}

		if (DOM.isHTMLElement(activeElement)) {
			this._lastFocusedElement = activeElement;
		}
	}

	public override dispose(): void {
		super.dispose();

		this._lastFocusedElement?.focus();

		if (this._overlay && this._root) {
			if (this._options.parent) {
				this._options.parent.removeAttribute('aria-expanded');
			}

			this._root.unmount();
			this._root = undefined;

			this._overlay.remove();
			this._overlay = undefined;

			ErdosModalReactRenderer._renderersStack.delete(this);
			ErdosModalReactRenderer.bindEventListeners();
		}

		if (this._options.onDisposed) {
			this._options.onDisposed();
		}
	}

	get services(): ErdosReactServices {
		return ErdosReactServices.services;
	}

	get container() {
		return this._options.container!;
	}

	readonly onKeyDown = this._onKeyDownEmitter.event;
	readonly onMouseDown = this._onMouseDownEmitter.event;
	readonly onResize = this._onResizeEmitter.event;

	public render(reactElement: ReactElement) {
		if (!this._overlay && !this._root) {
			if (this._options.parent) {
				this._options.parent.setAttribute('aria-expanded', 'true');
			}

			this._overlay = this._options.container!.appendChild(
				DOM.$('.erdos-modal-overlay', { tabIndex: 0 })
			);
			this._root = createRoot(this._overlay);

			this._root.render(
				<ErdosReactServicesContext.Provider value={ErdosReactServices.services}>
					{reactElement}
				</ErdosReactServicesContext.Provider>
			);

			this._overlay.focus();

			ErdosModalReactRenderer._renderersStack.add(this);
			ErdosModalReactRenderer.bindEventListeners();
		}
	}

	private static bindEventListeners() {
		if (ErdosModalReactRenderer._unbindCallback) {
			ErdosModalReactRenderer._unbindCallback();
			ErdosModalReactRenderer._unbindCallback = undefined;
		}

		const renderer = [...ErdosModalReactRenderer._renderersStack].pop();
		if (!renderer) {
			return;
		}

		const window = DOM.getWindow(renderer._options.container);

		const keydownHandler = (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			const resolutionResult = ErdosReactServices.services.keybindingService.softDispatch(
				event,
				ErdosReactServices.services.workbenchLayoutService.activeContainer
			);

			if (resolutionResult.kind === ResultKind.KbFound && resolutionResult.commandId) {
				if (ALLOWABLE_COMMANDS.indexOf(resolutionResult.commandId) === -1) {
					DOM.EventHelper.stop(event, true);
				}
			}

			renderer._onKeyDownEmitter.fire(e);
		};

		const mousedownHandler = (e: MouseEvent) => {
			renderer._onMouseDownEmitter.fire(e);
		};

		const resizeHandler = (e: UIEvent) => {
			ErdosModalReactRenderer._renderersStack.forEach(renderer => {
				renderer._onResizeEmitter.fire(e);
			});
		};

		window.addEventListener(KEYDOWN, keydownHandler, renderer._options.disableCaptures ? false : true);
		window.addEventListener(MOUSEDOWN, mousedownHandler, true);
		window.addEventListener(RESIZE, resizeHandler, false);

		ErdosModalReactRenderer._unbindCallback = () => {
			window.removeEventListener(KEYDOWN, keydownHandler, renderer._options.disableCaptures ? false : true);
			window.removeEventListener(MOUSEDOWN, mousedownHandler, true);
			window.removeEventListener(RESIZE, resizeHandler, false);
		};
	}
}
