/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import * as DOM from '../../../../base/browser/dom.js';
import { IAction } from '../../../../base/common/actions.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ErdosHelpFocused } from '../../../common/contextkeys.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { isLocalhost } from './utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { KeyEvent } from '../../webview/browser/webviewMessages.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService, OpenExternalOptions } from '../../../../platform/opener/common/opener.js';
import { WebviewFindDelegate } from '../../webview/browser/webviewFindWidget.js';
import { AnchorAlignment, AnchorAxisAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { ERDOS_HELP_COPY } from './erdosHelpIdentifiers.js';
import { IOverlayWebview, IWebviewService, WebviewContentPurpose } from '../../webview/browser/webview.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

const TITLE_TIMEOUT = 1000;
const DISPOSE_TIMEOUT = 15 * 1000;

function generateNonce() {
	let nonce = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 64; i++) {
		nonce += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return nonce;
}

const shortenUrl = (url: string) => url.replace(new URL(url).origin, '');

type KeyboardMessage = {
	readonly key: string;
	readonly keyCode: number;
	readonly code: string;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly repeat: boolean;
};

type ErdosHelpMessageInteractive = {
	readonly id: 'erdos-help-interactive';
};

type ErdosHelpMessageComplete = {
	readonly id: 'erdos-help-complete';
	readonly url: string;
	readonly title?: string;
};

type ErdosHelpMessageNavigate = {
	readonly id: 'erdos-help-navigate';
	readonly url: string;
};

type ErdosHelpMessageNavigateBackward = {
	readonly id: 'erdos-help-navigate-backward';
};

type ErdosHelpMessageNavigateForward = {
	readonly id: 'erdos-help-navigate-forward';
};

type ErdosHelpMessageScroll = {
	readonly id: 'erdos-help-scroll';
	readonly scrollX: number;
	readonly scrollY: number;
};

type ErdosHelpMessageFindResult = {
	readonly id: 'erdos-help-find-result';
	readonly findResult: boolean;
};

type ErdosHelpMessageContextMenu = {
	readonly id: 'erdos-help-context-menu';
	readonly screenX: number;
	readonly screenY: number;
	readonly selection: string;
};

type ErdosHelpMessageKeydown = {
	readonly id: 'erdos-help-keydown';
} & KeyboardMessage;

type ErdosHelpMessageKeyup = {
	readonly id: 'erdos-help-keyup';
} & KeyboardMessage;

type ErdosHelpMessageCopySelection = {
	readonly id: 'erdos-help-copy-selection';
	selection: string;
};

type ErdosHelpMessageExecuteCommand = {
	readonly id: 'erdos-help-execute-command';
	command: string;
};

type ErdosHelpMessage =
	| ErdosHelpMessageInteractive
	| ErdosHelpMessageComplete
	| ErdosHelpMessageNavigate
	| ErdosHelpMessageNavigateBackward
	| ErdosHelpMessageNavigateForward
	| ErdosHelpMessageScroll
	| ErdosHelpMessageFindResult
	| ErdosHelpMessageContextMenu
	| ErdosHelpMessageKeydown
	| ErdosHelpMessageKeyup
	| ErdosHelpMessageCopySelection
	| ErdosHelpMessageExecuteCommand;

export interface IHelpEntry {
	readonly sourceUrl: string;

	readonly title: string | undefined;

	readonly onDidChangeTitle: Event<String>;

	readonly onDidNavigate: Event<String>;

	readonly onDidNavigateBackward: Event<void>;

	readonly onDidNavigateForward: Event<void>;

	showHelpOverlayWebview(element: HTMLElement): void;

	hideHelpOverlayWebview(dispose: boolean): void;

	showFind(): void;

	hideFind(): void;
}

export class HelpEntry extends Disposable implements IHelpEntry, WebviewFindDelegate {
	private _title?: string;

	private _scrollX = 0;

	private _scrollY = 0;

	private _element?: HTMLElement;

	private _helpOverlayWebview?: IOverlayWebview;

	private _webviewEventListeners: IDisposable[] = [];

	private _setTitleTimeout?: Timeout;

	private _claimTimeout?: Timeout;

	private helpFocusedContextKey: IContextKey<boolean>;

	private _disposeTimeout?: Timeout;

	private readonly _onDidChangeTitleEmitter = this._register(new Emitter<string>);

	private readonly _onDidNavigateEmitter = this._register(new Emitter<string>);

	private readonly _onDidNavigateBackwardEmitter = this._register(new Emitter<void>);

	private readonly _onDidNavigateForwardEmitter = this._register(new Emitter<void>);

	private readonly _hasFindResultEmitter = this._register(new Emitter<boolean>);

	private readonly _onDidStopFindEmitter = this._register(new Emitter<void>);

	constructor(
		public readonly helpHTML: string,
		public readonly languageId: string,
		public readonly sessionId: string,
		public readonly languageName: string,
		public readonly sourceUrl: string,
		public readonly targetUrl: string,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IThemeService private readonly _themeService: IThemeService,
		@IWebviewService private readonly _webviewService: IWebviewService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		this._register(this._themeService.onDidColorThemeChange(_colorTheme => {
			this._helpOverlayWebview?.reload();
		}));

		this.helpFocusedContextKey = ErdosHelpFocused.bindTo(this._contextKeyService);
	}

	private disposeWebviewEventListeners(): void {
		this._webviewEventListeners.forEach(disposable => disposable.dispose());
		this._webviewEventListeners = [];
	}

	public override dispose(): void {
		if (this._setTitleTimeout) {
			clearTimeout(this._setTitleTimeout);
			this._setTitleTimeout = undefined;
		}

		if (this._claimTimeout) {
			clearTimeout(this._claimTimeout);
			this._claimTimeout = undefined;
		}

		if (this._disposeTimeout) {
			clearTimeout(this._disposeTimeout);
			this._disposeTimeout = undefined;
		}

		this.disposeWebviewEventListeners();

		if (this._helpOverlayWebview) {
			this._helpOverlayWebview.dispose();
			this._helpOverlayWebview = undefined;
		}

		super.dispose();
	}

	get title() {
		return this._title;
	}

	readonly onDidChangeTitle = this._onDidChangeTitleEmitter.event;

	readonly onDidNavigate = this._onDidNavigateEmitter.event;

	readonly onDidNavigateBackward = this._onDidNavigateBackwardEmitter.event;

	readonly onDidNavigateForward = this._onDidNavigateForwardEmitter.event;

	public showHelpOverlayWebview(element: HTMLElement) {
		if (this._disposeTimeout) {
			clearTimeout(this._disposeTimeout);
			this._disposeTimeout = undefined;
		}

		if (!this._helpOverlayWebview) {
			this.disposeWebviewEventListeners();

			this._helpOverlayWebview = this._webviewService.createWebviewOverlay({
				title: 'Erdos Help',
				extension: {
					id: new ExtensionIdentifier('erdos-help'),
				},
				options: {
					purpose: WebviewContentPurpose.WebviewView,
					enableFindWidget: true,
					disableServiceWorker: true,
					retainContextWhenHidden: true,
				},
				contentOptions: {
					allowScripts: true
				},
			});

			this._webviewEventListeners.push(this._helpOverlayWebview.onMessage(async e => {
				const message = e.message as ErdosHelpMessage;
				switch (message.id) {
					case 'erdos-help-interactive':
						break;

					case 'erdos-help-complete':
						if (message.title) {
							if (this._setTitleTimeout) {
								clearTimeout(this._setTitleTimeout);
								this._setTitleTimeout = undefined;
							}
							this._title = message.title;
							this._onDidChangeTitleEmitter.fire(this._title);
						}
						break;

					case 'erdos-help-navigate': {
						const url = new URL(message.url);
						if (!isLocalhost(url.hostname) || url.pathname.toLowerCase().endsWith('.pdf')) {
							try {
								await this._openerService.open(message.url, {
									openExternal: true
								} satisfies OpenExternalOptions);
							} catch {
								this._notificationService.error(localize(
									'erdosHelpOpenFailed',
									"Erdos was unable to open '{0}'.", message.url
								));
							}
						} else {
							this._onDidNavigateEmitter.fire(message.url);
						}
						break;
					}

					case 'erdos-help-navigate-backward':
						this._onDidNavigateBackwardEmitter.fire();
						break;

					case 'erdos-help-navigate-forward':
						this._onDidNavigateForwardEmitter.fire();
						break;

					case 'erdos-help-scroll':
						this._scrollX = message.scrollX;
						this._scrollY = message.scrollY;
						break;

					case 'erdos-help-find-result':
						this._hasFindResultEmitter.fire(message.findResult);
						break;

					case 'erdos-help-context-menu':
						this.showContextMenu(message.screenX, message.screenY, message.selection);
						break;

					case 'erdos-help-keydown': {
						const cmdOrCtrlKey = isMacintosh ? message.metaKey : message.ctrlKey;

						if (cmdOrCtrlKey && message.code === 'KeyC') {
							this._helpOverlayWebview?.postMessage({
								id: 'erdos-help-copy-selection'
							});
						} else {
							this.emulateKeyEvent('keydown', { ...message });
						}
						break;
					}

					case 'erdos-help-keyup':
						this.emulateKeyEvent('keyup', { ...message });
						break;

					case 'erdos-help-copy-selection':
						if (message.selection) {
							this._clipboardService.writeText(message.selection);
						}
						break;

					case 'erdos-help-execute-command': {
						if (message.command) {
							this._commandService.executeCommand(message.command);
						}
						break;
					}
				}
			}));

			this._helpOverlayWebview.setHtml(
				this.helpHTML
					.replaceAll('__nonce__', generateNonce())
					.replaceAll('__sourceURL__', this.sourceUrl)
					.replaceAll('__scrollX__', `${this._scrollX}`)
					.replaceAll('__scrollY__', `${this._scrollY}`)
			);

			this._setTitleTimeout = setTimeout(() => {
				this._setTitleTimeout = undefined;
				this._title = shortenUrl(this.sourceUrl);
				this._onDidChangeTitleEmitter.fire(this._title);
			}, TITLE_TIMEOUT);
		}

		this._element = element;
		const helpOverlayWebview = this._helpOverlayWebview;

		let oldBounds: DOMRect | undefined;

		let numberOfChecks = 0;
		const maxNumberOfChecks = 12;
		const waitBetweenChecksMs = 25;
		const ensureWebviewSizeCorrectWhenAnimating = () => {
			const currentBounds = element.getBoundingClientRect();
			const boundsHaveChanged = oldBounds === undefined || (
				oldBounds.height !== currentBounds.height ||
				oldBounds.width !== currentBounds.width ||
				oldBounds.x !== currentBounds.x ||
				oldBounds.y !== currentBounds.y);

			const isCollapsed = currentBounds.height === 0 || currentBounds.width === 0;
			const finishedAnimating = !isCollapsed && !boundsHaveChanged;
			const hasExceededMaxChecks = numberOfChecks >= maxNumberOfChecks;

			if (finishedAnimating || hasExceededMaxChecks) {
				return;
			}
			helpOverlayWebview.layoutWebviewOverElement(element);

			oldBounds = currentBounds;
			numberOfChecks++;
			this._claimTimeout = setTimeout(ensureWebviewSizeCorrectWhenAnimating, waitBetweenChecksMs);
		};

		clearTimeout(this._claimTimeout);

		helpOverlayWebview.claim(element, DOM.getWindow(element), undefined);
		helpOverlayWebview.layoutWebviewOverElement(element);

		this._webviewEventListeners.push(helpOverlayWebview.onDidFocus(() => {
			this.helpFocusedContextKey.set(true);
		}));

		this._webviewEventListeners.push(helpOverlayWebview.onDidBlur(() => {
			this.helpFocusedContextKey.set(false);
		}));

		ensureWebviewSizeCorrectWhenAnimating();
	}

	public hideHelpOverlayWebview(dispose: boolean) {
		if (this._helpOverlayWebview) {
			this.hideFind();
			if (this._element) {
				this._helpOverlayWebview.release(this._element);
				this._element = undefined;
			}
			if (dispose && !this._disposeTimeout) {
				this._disposeTimeout = setTimeout(() => {
					this._disposeTimeout = undefined;
					this.disposeWebviewEventListeners();
					if (this._helpOverlayWebview) {
						this._helpOverlayWebview.dispose();
						this._helpOverlayWebview = undefined;
					}
				}, DISPOSE_TIMEOUT);
			}
		}
	}

	public showFind() {
		this._helpOverlayWebview?.showFind(true);
	}

	public hideFind() {
		this._helpOverlayWebview?.hideFind(true, false);
	}

	readonly checkImeCompletionState = true;

	readonly hasFindResult = this._hasFindResultEmitter.event;

	readonly onDidStopFind = this._onDidStopFindEmitter.event;

	public find(value: string, previous: boolean) {
		if (this._helpOverlayWebview) {
			// First ensure the search term is indexed
			this._helpOverlayWebview.postMessage({
				id: 'erdos-help-update-find',
				findValue: value
			});

			// Then navigate
			setTimeout(() => {
				if (previous) {
					this._helpOverlayWebview?.postMessage({
						id: 'erdos-help-find-previous',
						findValue: value
					});
				} else {
					this._helpOverlayWebview?.postMessage({
						id: 'erdos-help-find-next',
						findValue: value
					});
				}

				setTimeout(() => {
					this._helpOverlayWebview?.postMessage({
						id: 'erdos-help-focus'
					});
				}, 50);
			}, 50);
		}
	}

	public updateFind(value: string) {
		if (this._helpOverlayWebview) {
			this._helpOverlayWebview.postMessage({
				id: 'erdos-help-update-find',
				findValue: value
			});
		}
	}

	public stopFind(keepSelection?: boolean) {
		if (this._helpOverlayWebview && !keepSelection) {
			this._helpOverlayWebview.postMessage({
				id: 'erdos-help-update-find',
				findValue: undefined
			});
		}
	}

	public focus() {
	}

	private emulateKeyEvent(type: 'keydown' | 'keyup', event: KeyEvent) {
		const emulatedKeyboardEvent = new KeyboardEvent(type, event);

		Object.defineProperty(emulatedKeyboardEvent, 'target', {
			get: () => this._element,
		});

		DOM.getActiveWindow().dispatchEvent(emulatedKeyboardEvent);
	}

	private async showContextMenu(
		screenX: number,
		screenY: number,
		selection: string
	): Promise<void> {
		if (!this._element) {
			return;
		}

		const actions: IAction[] = [];

		actions.push({
			id: ERDOS_HELP_COPY,
			label: localize('erdos.console.copy', "Copy"),
			tooltip: '',
			class: undefined,
			enabled: selection.length !== 0,
			run: () => {
				if (selection) {
					this._clipboardService.writeText(selection);
				}
			}
		});

		const scopedContextKeyService = this._contextKeyService.createScoped(this._element);

		const contextKey = ErdosHelpFocused.bindTo(scopedContextKeyService);

		const contextKeyValue = contextKey.get();
		if (!contextKeyValue) {
			contextKey.set(true);
		}

		const activeWindow = DOM.getActiveWindow();
		const x = screenX - activeWindow.screenX;
		const y = screenY - activeWindow.screenY;
		this._contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => ({
				x,
				y
			}),
			anchorAlignment: AnchorAlignment.LEFT,
			anchorAxisAlignment: AnchorAxisAlignment.VERTICAL,
			onHide: didCancel => {
				if (!contextKeyValue) {
					contextKey.set(false);
				}

				scopedContextKeyService.dispose();
			},
		});
	}
}
