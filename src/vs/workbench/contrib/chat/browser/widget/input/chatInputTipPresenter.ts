/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatTipService } from '../../chatTipService.js';
import { ChatContentMarkdownRenderer } from '../chatContentMarkdownRenderer.js';
import { ChatTipContentPart } from '../chatContentParts/chatTipContentPart.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from './chatInputNoticeHost.js';
import { ChatInputStackSlot, setChatInputStackSlot } from './chatInputStack.js';

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
	private _leading = false;
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

		// Takes the tip out of the container even if the notice host is already
		// gone, so disposal never depends on a stand-down that will not arrive.
		this._register(toDisposable(() => this._clearContent()));

		this.update();
	}

	/**
	 * Re-evaluate whether this surface wants a tip at all. Claiming the tip lane is
	 * all this does: whether the tip is actually on screen is the notice host's
	 * answer, delivered through `onDidChangeLeading`, so the tip yields to a higher
	 * lane and comes back once that content goes away without polling for it.
	 */
	update(): void {
		this._options.onBeforeUpdate?.();

		if (!this._options.isEligible()) {
			this.clear();
			return;
		}

		if (!this._lease.value) {
			this._lease.value = this._noticeHost.occupy(ChatInputNoticeLane.Tip, {
				focusTarget: {
					hasFocus: () => this._partRef?.hasFocus() ?? false,
					focus: () => this._partRef?.focus(),
					// The lane is claimed while this surface wants a tip, but there is
					// only something to focus once one is actually rendered.
					canFocus: () => !!this._partRef,
				},
				onDidChangeLeading: leading => this._setLeading(leading),
			});
		} else if (this._leading) {
			// Already on screen: re-evaluate which tip should be showing.
			this._render();
		}
	}

	private _setLeading(leading: boolean): void {
		this._leading = leading;
		if (leading) {
			this._render();
		} else {
			this._clearContent();
		}
	}

	/**
	 * Build the tip that should be showing. Never touches the claim, so rendering
	 * cannot feed back into the arbitration that asked for it.
	 */
	private _render(): void {
		const tip = this._chatTipService.getWelcomeTip(this._contextKeyService);
		if (!tip) {
			this._clearContent();
			return;
		}

		// An eligible tip is already rendered; keep it rather than rotating.
		if (this._part.value) {
			setChatInputStackSlot(this._options.container, ChatInputStackSlot.Docked);
			return;
		}

		const store = new DisposableStore();
		const renderer = this._instantiationService.createInstance(ChatContentMarkdownRenderer);
		const tipPart = store.add(this._instantiationService.createInstance(ChatTipContentPart, tip, renderer));

		store.add(tipPart.onDidHide(() => {
			this.clear();
			this._options.focusInput();
		}));

		// Set both before touching the DOM so re-entrant calls triggered by
		// context-key changes during construction do not append a second tip.
		this._part.value = store;
		this._partRef = tipPart;
		dom.clearNode(this._options.container);
		this._options.container.appendChild(tipPart.domNode);
		setChatInputStackSlot(this._options.container, ChatInputStackSlot.Docked);
	}

	/** Take the tip off screen and give up the lane. */
	clear(): void {
		this._leading = false;
		this._lease.clear();
		this._clearContent();
	}

	private _clearContent(): void {
		this._partRef = undefined;
		this._part.clear();
		dom.clearNode(this._options.container);
		setChatInputStackSlot(this._options.container, ChatInputStackSlot.Empty);
	}
}
