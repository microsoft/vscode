/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatTipService } from '../../chatTipService.js';
import { ChatContentMarkdownRenderer } from '../chatContentMarkdownRenderer.js';
import { ChatTipContentPart } from '../chatContentParts/chatTipContentPart.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from './chatInputNoticeHost.js';

export interface IChatInputTipPresenterOptions {
	/** The element the tip is rendered into. Hidden while no tip is showing. */
	readonly container: HTMLElement;
	/** Decides whether this surface currently wants a tip at all. */
	readonly isEligible: () => boolean;
	/** Returns focus to the input once the tip removes itself. */
	readonly focusInput: () => void;
	/** Runs before every evaluation, for surfaces that must reset tip rotation. */
	readonly onBeforeUpdate?: () => void;
}

/**
 * Renders the getting-started tip for one chat input and keeps it out of the
 * way of higher-precedence notices. Shared by the workbench chat widget and the
 * Agents window composer so tip presentation exists in exactly one place.
 */
export class ChatInputTipPresenter extends Disposable {

	private readonly _part = this._register(new MutableDisposable<DisposableStore>());
	private readonly _lease = this._register(new MutableDisposable<IDisposable>());
	private _partRef: ChatTipContentPart | undefined;

	/** The rendered tip, when one is showing. */
	get current(): ChatTipContentPart | undefined {
		return this._partRef;
	}

	constructor(
		private readonly _options: IChatInputTipPresenterOptions,
		private readonly _noticeHost: ChatInputNoticeHost,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatTipService private readonly _chatTipService: IChatTipService,
	) {
		super();

		// Re-evaluates whenever occupancy changes, so the tip yields to a higher
		// lane and returns once that content goes away.
		this._register(autorun(reader => this.update(reader)));
	}

	/** Re-evaluate whether a tip should be showing, and which one. */
	update(reader?: IReader): void {
		this._options.onBeforeUpdate?.();

		if (this._noticeHost.isSuppressed(ChatInputNoticeLane.Tip, reader) || !this._options.isEligible()) {
			this.clear();
			return;
		}

		const tip = this._chatTipService.getWelcomeTip(this._contextKeyService);
		if (!tip) {
			this.clear();
			return;
		}

		// An eligible tip is already rendered; keep it rather than rotating.
		if (this._part.value) {
			dom.setVisibility(true, this._options.container);
			return;
		}

		const store = new DisposableStore();
		const renderer = this._instantiationService.createInstance(ChatContentMarkdownRenderer);
		const tipPart = store.add(this._instantiationService.createInstance(ChatTipContentPart, tip, renderer));
		this._partRef = tipPart;

		store.add(tipPart.onDidHide(() => {
			this.clear();
			this._options.focusInput();
		}));

		// Set the guard before touching the DOM so re-entrant calls triggered by
		// context-key changes during construction do not append a second tip.
		this._part.value = store;
		this._lease.value = this._noticeHost.occupy(ChatInputNoticeLane.Tip, {
			hasFocus: () => tipPart.hasFocus(),
			focus: () => tipPart.focus(),
		});
		dom.clearNode(this._options.container);
		this._options.container.appendChild(tipPart.domNode);
		dom.setVisibility(true, this._options.container);
	}

	clear(): void {
		this._partRef = undefined;
		this._lease.clear();
		this._part.clear();
		dom.clearNode(this._options.container);
		dom.setVisibility(false, this._options.container);
	}
}
