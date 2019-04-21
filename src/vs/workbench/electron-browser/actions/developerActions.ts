/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import * as nls from 'vs/nls';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { domEvent } from 'vs/base/browser/event';
import { Event } from 'vs/base/common/event';
import { IDisposable, toDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { getDomNodePagePosition, createStyleSheet, createCSSRule, append, $ } from 'vs/base/browser/dom';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Context } from 'vs/platform/contextkey/browser/contextKeyService';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { timeout } from 'vs/base/common/async';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

export class ToggleDevToolsAction extends Action {

	static readonly ID = 'workbench.action.toggleDevTools';
	static LABEL = nls.localize('toggleDevTools', "Toggle Developer Tools");

	constructor(id: string, label: string, @IWindowService private readonly windowsService: IWindowService) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.windowsService.toggleDevTools();
	}
}

export class ToggleSharedProcessAction extends Action {

	static readonly ID = 'workbench.action.toggleSharedProcess';
	static LABEL = nls.localize('toggleSharedProcess', "Toggle Shared Process");

	constructor(id: string, label: string, @IWindowsService private readonly windowsService: IWindowsService) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.windowsService.toggleSharedProcess();
	}
}

export class InspectContextKeysAction extends Action {

	static readonly ID = 'workbench.action.inspectContextKeys';
	static LABEL = nls.localize('inspect context keys', "Inspect Context Keys");

	constructor(
		id: string,
		label: string,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWindowService private readonly windowService: IWindowService,
	) {
		super(id, label);
	}

	run(): Promise<void> {
		const disposables: IDisposable[] = [];

		const stylesheet = createStyleSheet();
		disposables.push(toDisposable(() => {
			if (stylesheet.parentNode) {
				stylesheet.parentNode.removeChild(stylesheet);
			}
		}));
		createCSSRule('*', 'cursor: crosshair !important;', stylesheet);

		const hoverFeedback = document.createElement('div');
		document.body.appendChild(hoverFeedback);
		disposables.push(toDisposable(() => document.body.removeChild(hoverFeedback)));

		hoverFeedback.style.position = 'absolute';
		hoverFeedback.style.pointerEvents = 'none';
		hoverFeedback.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
		hoverFeedback.style.zIndex = '1000';

		const onMouseMove = domEvent(document.body, 'mousemove', true);
		disposables.push(onMouseMove(e => {
			const target = e.target as HTMLElement;
			const position = getDomNodePagePosition(target);

			hoverFeedback.style.top = `${position.top}px`;
			hoverFeedback.style.left = `${position.left}px`;
			hoverFeedback.style.width = `${position.width}px`;
			hoverFeedback.style.height = `${position.height}px`;
		}));

		const onMouseDown = Event.once(domEvent(document.body, 'mousedown', true));
		onMouseDown(e => { e.preventDefault(); e.stopPropagation(); }, null, disposables);

		const onMouseUp = Event.once(domEvent(document.body, 'mouseup', true));
		onMouseUp(e => {
			e.preventDefault();
			e.stopPropagation();

			const context = this.contextKeyService.getContext(e.target as HTMLElement) as Context;
			console.log(context.collectAllValues());
			this.windowService.openDevTools();

			dispose(disposables);
		}, null, disposables);

		return Promise.resolve();
	}
}

export class ToggleScreencastModeAction extends Action {

	static readonly ID = 'workbench.action.toggleScreencastMode';
	static LABEL = nls.localize('toggle screencast mode', "Toggle Screencast Mode");

	static disposable: IDisposable | undefined;

	constructor(
		id: string,
		label: string,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
	}

	async run(): Promise<void> {
		if (ToggleScreencastModeAction.disposable) {
			ToggleScreencastModeAction.disposable.dispose();
			ToggleScreencastModeAction.disposable = undefined;
			return;
		}

		const container = this.layoutService.getWorkbenchElement();

		const mouseMarker = append(container, $('div'));
		mouseMarker.style.position = 'absolute';
		mouseMarker.style.border = '2px solid red';
		mouseMarker.style.borderRadius = '20px';
		mouseMarker.style.width = '20px';
		mouseMarker.style.height = '20px';
		mouseMarker.style.top = '0';
		mouseMarker.style.left = '0';
		mouseMarker.style.zIndex = '100000';
		mouseMarker.style.content = ' ';
		mouseMarker.style.pointerEvents = 'none';
		mouseMarker.style.display = 'none';

		const onMouseDown = domEvent(container, 'mousedown', true);
		const onMouseUp = domEvent(container, 'mouseup', true);
		const onMouseMove = domEvent(container, 'mousemove', true);

		const mouseListener = onMouseDown(e => {
			mouseMarker.style.top = `${e.clientY - 10}px`;
			mouseMarker.style.left = `${e.clientX - 10}px`;
			mouseMarker.style.display = 'block';

			const mouseMoveListener = onMouseMove(e => {
				mouseMarker.style.top = `${e.clientY - 10}px`;
				mouseMarker.style.left = `${e.clientX - 10}px`;
			});

			Event.once(onMouseUp)(() => {
				mouseMarker.style.display = 'none';
				mouseMoveListener.dispose();
			});
		});

		const keyboardMarker = append(container, $('div'));
		keyboardMarker.style.position = 'absolute';
		keyboardMarker.style.backgroundColor = 'rgba(0, 0, 0 ,0.5)';
		keyboardMarker.style.width = '80%';
		keyboardMarker.style.height = '100px';
		keyboardMarker.style.bottom = '20%';
		keyboardMarker.style.left = '0';
		keyboardMarker.style.zIndex = '100000';
		keyboardMarker.style.pointerEvents = 'none';
		keyboardMarker.style.color = 'white';
		keyboardMarker.style.lineHeight = '100px';
		keyboardMarker.style.textAlign = 'center';
		keyboardMarker.style.fontSize = '56px';
		keyboardMarker.style.display = 'none';
		keyboardMarker.style.paddingLeft = '10%';
		keyboardMarker.style.paddingRight = '10%';
		const onKeyDown = domEvent(document.body, 'keydown', true);
		let keyboardTimeout: IDisposable = Disposable.None;
		let isChord: boolean = false;

		const keyboardListener = onKeyDown(e => {
			keyboardTimeout.dispose();

			const event = new StandardKeyboardEvent(e);
			const keybinding = this.keybindingService.resolveKeyboardEvent(event);
			const label = keybinding.getLabel();

			if ((event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || specialkeys.indexOf(event.keyCode) !== -1)) {
				const lastToken = oldtext.substr(oldtext.lastIndexOf(' ') + 1);
				keyboardMarker.textContent = (label.substring(0, lastToken.length) === lastToken) ? oldtext.substring(0, oldtext.lastIndexOf(' ')) + ' ' + label : keyboardMarker.textContent += ' ' + label;
			}
			else {
				keyboardMarker.textContent += ' ' + label;
			}

<<<<<<< HEAD
<<<<<<< HEAD
			if (event.ctrlKey || event.altKey || event.metaKey) {
				if (isChord) {
					keyboardMarker.textContent += ' ' + label;
				} else {
					keyboardMarker.textContent = label;
				}
				isChord = event.keyCode === 41;
			} else if ((keyboardMarker.textContent !== null && label !== null) && (event.keyCode < 21 || (event.keyCode > 56 && event.keyCode < 80) || event.shiftKey)) {
				const lastToken = keyboardMarker.textContent.substr(keyboardMarker.textContent.lastIndexOf(' ') + 1);
				if (label.substring(0, lastToken.length) === lastToken) {
					if (lastToken.lastIndexOf('+') !== -1 && lastToken.lastIndexOf('+') !== lastToken.length - 1) {
						keyboardMarker.textContent += ' ' + label;
					} else {
						keyboardMarker.textContent = keyboardMarker.textContent.substring(0, keyboardMarker.textContent.lastIndexOf(' ')) + ' ' + label;
					}
				} else {
					keyboardMarker.textContent += ' ' + label;
				}
			} else {
				keyboardMarker.textContent += ' ' + label;
			}

<<<<<<< HEAD
			if (keyboardMarker.textContent !== null && label !== null && keyboardMarker.scrollHeight > keyboardMarker.clientHeight) {
				keyboardMarker.textContent = keyboardMarker.textContent.substring(label.length + 3);
=======
			keyboardMarker.textContent += ' ' + label;

			if (keyboardMarker.scrollHeight > keyboardMarker.clientHeight || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !this.keybindingService.mightProducePrintableCharacter(event) || !label) {
				keyboardMarker.textContent = label;
>>>>>>> fixes overflow in screencast mode
=======

			if (keyboardMarker.scrollHeight > keyboardMarker.clientHeight) {
				keyboardMarker.textContent = keyboardMarker.textContent.substring(label.length + 4);
>>>>>>> Added fixes for 68849, 66675, and 67965
=======
			while (keyboardMarker.textContent !== null && label !== null && keyboardMarker.scrollHeight > keyboardMarker.clientHeight) {
				keyboardMarker.textContent = keyboardMarker.textContent.substring(1);
>>>>>>> corrected the variable full length bug
			}

			keyboardMarker.style.display = 'block';

			const promise = timeout(800);
			keyboardTimeout = toDisposable(() => promise.cancel());

			promise.then(() => {
				keyboardMarker.textContent = '';
				keyboardMarker.style.display = 'none';
			});
		});

		ToggleScreencastModeAction.disposable = toDisposable(() => {
			mouseListener.dispose();
			keyboardListener.dispose();
			mouseMarker.remove();
			keyboardMarker.remove();
		});
	}
}
