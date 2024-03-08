/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./inlineChatQuickVoice';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Codicon } from 'vs/base/common/codicons';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { localize, localize2 } from 'vs/nls';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { HasSpeechProvider, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import * as dom from 'vs/base/browser/dom';
import { IDimension } from 'vs/editor/common/core/dimension';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { AbstractInlineChatAction } from 'vs/workbench/contrib/inlineChat/browser/inlineChatActions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IVoiceChatService } from 'vs/workbench/contrib/chat/common/voiceChat';

const CTX_QUICK_CHAT_IN_PROGRESS = new RawContextKey<boolean>('inlineChat.quickChatInProgress', false);

export class StartAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.quickVoice.start',
			title: localize2('start', "Start Inline Voice Chat"),
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CTX_QUICK_CHAT_IN_PROGRESS.toNegated(), EditorContextKeys.focus),
			f1: true,
			keybinding: {
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyI),
				weight: KeybindingWeight.WorkbenchContrib + 100
			}
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor) {
		const keybindingService = accessor.get(IKeybindingService);

		const holdMode = keybindingService.enableKeybindingHoldMode(this.desc.id);
		if (holdMode) {
			let shouldCallStop = false;
			const handle = setTimeout(() => {
				shouldCallStop = true;
			}, 500);
			holdMode.finally(() => {
				clearTimeout(handle);
				if (shouldCallStop) {
					InlineChatQuickVoice.get(editor)?.stop();
				}
			});
		}
		InlineChatQuickVoice.get(editor)?.start();
	}
}

export class StopAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.quickVoice.stop',
			title: localize2('stop', "Stop Inline Voice Chat"),
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CTX_QUICK_CHAT_IN_PROGRESS),
			f1: true,
			keybinding: {
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyI),
				weight: KeybindingWeight.WorkbenchContrib + 100
			}
		});
	}

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		InlineChatQuickVoice.get(editor)?.stop();
	}
}

export class CancelAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.quickVoice.Cancel',
			title: localize('Cancel', "Cancel Inline Voice Chat"),
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CTX_QUICK_CHAT_IN_PROGRESS),
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		InlineChatQuickVoice.get(editor)?.cancel();
	}
}

class QuickVoiceWidget implements IContentWidget {

	readonly suppressMouseDown = true;
	readonly allowEditorOverflow = true;

	private readonly _domNode = document.createElement('div');
	private readonly _elements = dom.h('.inline-chat-quick-voice@main', [
		dom.h('span@mic'),
		dom.h('span', [
			dom.h('span.message@message'),
			dom.h('span.preview@preview'),
		])
	]);

	private _focusTracker: dom.IFocusTracker | undefined;

	private readonly _onDidBlur = new Emitter<void>();
	readonly onDidBlur: Event<void> = this._onDidBlur.event;

	constructor(private readonly _editor: ICodeEditor) {
		this._domNode.appendChild(this._elements.root);
		this._domNode.style.zIndex = '1000';
		this._domNode.tabIndex = -1;
		this._domNode.style.outline = 'none';
		dom.reset(this._elements.mic, renderIcon(Codicon.micFilled));
	}

	dispose(): void {
		this._focusTracker?.dispose();
		this._onDidBlur.dispose();
	}

	getId(): string {
		return 'inlineChatQuickVoice';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this._editor.hasModel()) {
			return null;
		}
		const selection = this._editor.getSelection();
		return {
			position: selection.getStartPosition(),
			preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.EXACT]
		};
	}

	beforeRender(): IDimension | null {
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const width = this._editor.getLayoutInfo().contentWidth * 0.7;

		this._elements.main.style.setProperty('--vscode-inline-chat-quick-voice-height', `${lineHeight}px`);
		this._elements.main.style.setProperty('--vscode-inline-chat-quick-voice-width', `${width}px`);
		return null;
	}

	afterRender(): void {
		this._domNode.focus();
		this._focusTracker?.dispose();
		this._focusTracker = dom.trackFocus(this._domNode);
		this._focusTracker.onDidBlur(() => this._onDidBlur.fire());
	}

	// ---

	updateInput(data: { message?: string; preview?: string }): void {
		this._elements.message.textContent = data.message ?? '';
		this._elements.preview.textContent = data.preview ?? '';
	}

	show() {
		this._editor.addContentWidget(this);
	}

	active(): void {
		this._elements.main.classList.add('recording');
	}

	hide() {
		this._elements.main.classList.remove('recording');
		this._elements.message.textContent = '';
		this._elements.preview.textContent = '';
		this._editor.removeContentWidget(this);
		this._focusTracker?.dispose();
	}
}

export class InlineChatQuickVoice implements IEditorContribution {

	static readonly ID = 'inlineChatQuickVoice';

	static get(editor: ICodeEditor): InlineChatQuickVoice | null {
		return editor.getContribution<InlineChatQuickVoice>(InlineChatQuickVoice.ID);
	}

	private readonly _store = new DisposableStore();
	private readonly _ctxQuickChatInProgress: IContextKey<boolean>;
	private readonly _widget: QuickVoiceWidget;
	private _finishCallback?: (abort: boolean) => void;

	constructor(
		private readonly _editor: ICodeEditor,
		@IVoiceChatService private readonly _voiceChatService: IVoiceChatService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		this._widget = this._store.add(new QuickVoiceWidget(this._editor));
		this._widget.onDidBlur(() => this._finishCallback?.(true), undefined, this._store);
		this._ctxQuickChatInProgress = CTX_QUICK_CHAT_IN_PROGRESS.bindTo(contextKeyService);
	}

	dispose(): void {
		this._finishCallback?.(true);
		this._ctxQuickChatInProgress.reset();
		this._store.dispose();
	}

	async start() {

		this._finishCallback?.(true);

		const cts = new CancellationTokenSource();
		this._widget.show();
		this._ctxQuickChatInProgress.set(true);

		let message: string | undefined;
		let preview: string | undefined;
		const session = await this._voiceChatService.createVoiceChatSession(cts.token, { usesAgents: false });
		const listener = session.onDidChange(e => {

			if (cts.token.isCancellationRequested) {
				return;
			}

			switch (e.status) {
				case SpeechToTextStatus.Started:
					this._widget.active();
					break;
				case SpeechToTextStatus.Stopped:
					break;
				case SpeechToTextStatus.Recognizing:
					preview = e.text;
					this._widget.updateInput({ message, preview });
					break;
				case SpeechToTextStatus.Recognized:
					message = !message ? e.text : `${message} ${e.text}`;
					preview = '';
					this._widget.updateInput({ message, preview });
					break;
			}
		});

		const done = (abort: boolean) => {
			cts.dispose(true);
			listener.dispose();
			this._widget.hide();
			this._ctxQuickChatInProgress.reset();
			this._editor.focus();

			if (!abort && message) {
				InlineChatController.get(this._editor)?.run({ message, autoSend: true });
			}
		};

		this._finishCallback = done;
	}

	stop(): void {
		this._finishCallback?.(false);
	}

	cancel(): void {
		this._finishCallback?.(true);
	}
}
