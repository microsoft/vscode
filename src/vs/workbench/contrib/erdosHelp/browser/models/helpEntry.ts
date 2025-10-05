/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IOverlayWebview, IWebviewService, WebviewContentPurpose } from '../../../webview/browser/webview.js';
import { IHelpEntry } from '../topicViewContract.js';
import { generateNonce } from '../utils/urlUtils.js';
import { WebviewMessageHandler } from './webviewMessageHandler.js';

export class TopicWebviewDisplay extends Disposable implements IHelpEntry {
	private _title?: string;
	private _webview?: IOverlayWebview;
	private _element?: HTMLElement;

	private readonly _messageHandler: WebviewMessageHandler;
	private readonly _titleUpdateEmitter: Emitter<string>;
	private readonly _urlChangeEmitter: Emitter<string>;
	private readonly _backwardNavEmitter: Emitter<void>;
	private readonly _forwardNavEmitter: Emitter<void>;

	constructor(
		public readonly helpHTML: string,
		public readonly languageId: string,
		public readonly sessionId: string,
		public readonly languageName: string,
		public readonly sourceUrl: string,
		public readonly targetUrl: string,
		@IClipboardService clipboardService: IClipboardService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWebviewService private readonly _webviewService: IWebviewService,
		@ICommandService commandService: ICommandService,
	) {
		super();

		this._titleUpdateEmitter = this._register(new Emitter<string>());
		this._urlChangeEmitter = this._register(new Emitter<string>());
		this._backwardNavEmitter = this._register(new Emitter<void>());
		this._forwardNavEmitter = this._register(new Emitter<void>());

		this._messageHandler = new WebviewMessageHandler(
			clipboardService,
			commandService,
			this._titleUpdateEmitter,
			this._urlChangeEmitter,
			this._backwardNavEmitter,
			this._forwardNavEmitter
		);
	}

	get title(): string | undefined {
		return this._title;
	}

	get onTitleUpdated(): Event<string> {
		return this._titleUpdateEmitter.event;
	}

	get onUrlChanged(): Event<string> {
		return this._urlChangeEmitter.event;
	}

	get onBackwardNavigation(): Event<void> {
		return this._backwardNavEmitter.event;
	}

	get onForwardNavigation(): Event<void> {
		return this._forwardNavEmitter.event;
	}

	displayContent(element: HTMLElement): void {
		if (!this._webview) {
			this.initializeWebview();
		}

		this._element = element;
		this._webview!.claim(element, DOM.getWindow(element), undefined);
		this._webview!.layoutWebviewOverElement(element);
	}

	hideContent(dispose: boolean): void {
		if (this._webview && this._element) {
			this._webview.release(this._element);
			this._element = undefined;

			if (dispose) {
				this._webview.dispose();
				this._webview = undefined;
			}
		}
	}

	activateFindWidget(): void {
		this._webview?.showFind(true);
	}

	deactivateFindWidget(): void {
		this._webview?.hideFind(true, false);
	}

	private initializeWebview(): void {
		this._webview = this._webviewService.createWebviewOverlay({
			title: 'Erdos Help',
			extension: { id: new ExtensionIdentifier('erdos-help') },
			options: {
				purpose: WebviewContentPurpose.WebviewView,
				enableFindWidget: true,
				disableServiceWorker: true,
				retainContextWhenHidden: true,
			},
			contentOptions: { allowScripts: true },
		});

		this._register(
			this._webview.onMessage(e => this._messageHandler.handleMessage(e.message))
		);

		const html = this.helpHTML
			.replaceAll('__nonce__', generateNonce())
			.replaceAll('__sourceURL__', this.sourceUrl)
			.replaceAll('__scrollX__', '0')
			.replaceAll('__scrollY__', '0');

		this._webview.setHtml(html);
	}
}

export const HelpEntry = TopicWebviewDisplay;

