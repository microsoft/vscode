/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { h } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ITsCodeAuthService } from '../common/tsCodeAuth.js';

interface WelcomePageElements {
	root: HTMLElement;
	loginBtn: HTMLButtonElement;
	waitingMsg: HTMLElement;
	errorMsg: HTMLElement;
}

export class TsCodeWelcomePage extends Disposable {
	private readonly _onLoginClicked = this._register(new Emitter<void>());
	readonly onLoginClicked: Event<void> = this._onLoginClicked.event;

	private _overlay: HTMLElement | undefined;
	private _elements: WelcomePageElements | undefined;

	constructor(
		@ITsCodeAuthService private readonly authService: ITsCodeAuthService,
	) {
		super();
		this._register(authService.onDidNeedLogin(() => this.show()));
		this._register(authService.onDidStartOAuth(() => this.showWaitingState()));
		this._register(authService.onDidLogin(() => this.hide()));
		this._register(authService.onDidLoginError(msg => this.showErrorState(msg)));
		this._register(authService.onDidSecurityError(msg => this.showErrorState(msg)));
	}

	show(): void {
		if (this._overlay) { return; }

		const elements = this._buildDOM();
		this._elements = elements;

		elements.loginBtn.addEventListener('click', () => {
			this._onLoginClicked.fire();
			this.authService.startOAuthFlow();
		});

		// Mount directly on document.body to cover all VSCode UI
		mainWindow.document.body.appendChild(elements.root);
		this._overlay = elements.root;
	}

	hide(): void {
		if (this._overlay) {
			this._overlay.remove();
			this._overlay = undefined;
			this._elements = undefined;
		}
	}

	showWaitingState(): void {
		if (!this._elements) { return; }
		this._elements.loginBtn.style.display = 'none';
		this._elements.waitingMsg.style.display = 'block';
		this._elements.errorMsg.style.display = 'none';
	}

	showErrorState(message: string): void {
		if (!this._elements) { return; }
		this._elements.loginBtn.style.display = 'block';
		this._elements.waitingMsg.style.display = 'none';
		this._elements.errorMsg.textContent = message;
		this._elements.errorMsg.style.display = 'block';
	}

	private _buildDOM(): WelcomePageElements {
		const waitingMsg = h('div').root;
		waitingMsg.textContent = '正在等待授权完成...';
		waitingMsg.style.cssText = 'display: none; color: #888; margin-top: 20px; font-size: 14px;';

		const errorMsg = h('div').root;
		errorMsg.style.cssText = 'display: none; color: #f44; margin-top: 20px; font-size: 14px; max-width: 360px;';

		const loginBtn = h('button').root as HTMLButtonElement;
		loginBtn.textContent = '登 录';
		loginBtn.style.cssText = [
			'padding: 12px 0',
			'font-size: 16px',
			'font-weight: 600',
			'cursor: pointer',
			'background: #f0f0f0',
			'color: #1e1e1e',
			'border: none',
			'border-radius: 6px',
			'width: 360px',
			'margin-top: 8px',
			'letter-spacing: 2px',
		].join('; ');

		const brandTitle = h('div').root;
		brandTitle.textContent = 'TSCode';
		brandTitle.style.cssText = [
			'font-size: 72px',
			'font-weight: 800',
			'letter-spacing: 4px',
			'color: #ffffff',
			'margin-bottom: 8px',
		].join('; ');

		const welcomeText = h('div').root;
		welcomeText.textContent = '欢迎使用 TSCode';
		welcomeText.style.cssText = 'font-size: 20px; color: #ccc; margin-bottom: 12px; font-weight: 500;';

		const subtitle = h('div').root;
		subtitle.textContent = '一款帮助你发挥最佳水平的智能体 IDE。';
		subtitle.style.cssText = [
			'font-size: 15px',
			'color: #aaa',
			'margin-bottom: 40px',
			'max-width: 360px',
			'line-height: 1.7',
			'text-align: center',
		].join('; ');

		const inner = h('div').root;
		inner.style.cssText = 'text-align: center; color: white; display: flex; flex-direction: column; align-items: center;';
		inner.appendChild(brandTitle);
		inner.appendChild(welcomeText);
		inner.appendChild(subtitle);
		inner.appendChild(loginBtn);
		inner.appendChild(waitingMsg);
		inner.appendChild(errorMsg);

		const root = h('div').root;
		root.style.cssText = [
			'position: fixed',
			'top: 0',
			'left: 0',
			'width: 100%',
			'height: 100%',
			'background: #1e1e1e',
			'display: flex',
			'flex-direction: column',
			'align-items: center',
			'justify-content: center',
			'z-index: 999999',
		].join('; ');
		root.appendChild(inner);

		return { root, loginBtn, waitingMsg, errorMsg };
	}
}
