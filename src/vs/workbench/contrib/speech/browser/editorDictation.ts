/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editorDictation';
import { localize2 } from 'vs/nls';
import { IDimension, IFocusTracker, h, reset, trackFocus } from 'vs/base/browser/dom';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { HasSpeechProvider, ISpeechService, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';
import { Emitter } from 'vs/base/common/event';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Codicon } from 'vs/base/common/codicons';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { EditOperation } from 'vs/editor/common/core/editOperation';

const EDITOR_DICTATION_IN_PROGRESS = new RawContextKey<boolean>('editorDictation.inProgress', false);

export class EditorDictationStartAction extends EditorAction2 {

	constructor() {
		super({
			id: 'workbench.action.editorDictation.start',
			title: localize2('startDictation', "Start Dictation in Editor"),
			// category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(HasSpeechProvider, EDITOR_DICTATION_IN_PROGRESS.toNegated(), EditorContextKeys.readOnly.toNegated()),
			f1: true
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
					EditorDictation.get(editor)?.stop();
				}
			});
		}
		EditorDictation.get(editor)?.start();
	}
}

export class EditorDictationStopAction extends EditorAction2 {

	constructor() {
		super({
			id: 'workbench.action.editorDictation.stop',
			title: localize2('stopDictation', "Stop Dictation in Editor"),
			// category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(HasSpeechProvider, EDITOR_DICTATION_IN_PROGRESS),
			f1: true
		});
	}

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		EditorDictation.get(editor)?.stop();
	}
}

export class EditorDictationCancelAction extends EditorAction2 {

	constructor() {
		super({
			id: 'workbench.action.editorDictation.cancel',
			title: localize2('cancelDictation', "Cancel Dictation in Editor"),
			// category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(HasSpeechProvider, EDITOR_DICTATION_IN_PROGRESS),
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		EditorDictation.get(editor)?.cancel();
	}
}

export class DictationWidget extends Disposable implements IContentWidget {

	readonly suppressMouseDown = true;
	readonly allowEditorOverflow = true;

	private readonly domNode = document.createElement('div');
	private readonly elements = h('.inline-chat-quick-voice@main', [
		h('span@mic'),
		h('span', [
			h('span.message@message'),
			h('span.preview@preview'),
		])
	]);

	private focusTracker: IFocusTracker | undefined;

	private readonly _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;

	constructor(private readonly _editor: ICodeEditor) {
		super();

		this.domNode.appendChild(this.elements.root);
		this.domNode.style.zIndex = '1000';
		this.domNode.tabIndex = -1;
		this.domNode.style.outline = 'none';

		reset(this.elements.mic, renderIcon(Codicon.micFilled));
	}

	getId(): string {
		return 'editorDictation';
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this._editor.hasModel()) {
			return null;
		}
		const selection = this._editor.getSelection();
		// const position = this._editor.getPosition();
		return {
			position: selection.getPosition(),
			preference: [
				selection.getPosition().equals(selection.getStartPosition()) ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW,
				ContentWidgetPositionPreference.EXACT
			]
		};
	}

	beforeRender(): IDimension | null {
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const width = this._editor.getLayoutInfo().contentWidth * 0.7;

		this.elements.main.style.setProperty('--vscode-inline-chat-quick-voice-height', `${lineHeight}px`);
		this.elements.main.style.setProperty('--vscode-inline-chat-quick-voice-width', `${width}px`);

		return null;
	}

	afterRender(): void {
		this.domNode.focus();
		this.focusTracker?.dispose();
		this.focusTracker = trackFocus(this.domNode);
		this.focusTracker.onDidBlur(() => this._onDidBlur.fire());
	}

	show() {
		this._editor.addContentWidget(this);
	}

	active(): void {
		this.elements.main.classList.add('recording');
	}

	hide() {
		this.elements.main.classList.remove('recording');
		this.elements.message.textContent = '';
		this.elements.preview.textContent = '';
		this._editor.removeContentWidget(this);
		this.focusTracker?.dispose();
	}

	override dispose(): void {
		super.dispose();

		this.focusTracker?.dispose();
	}
}

export class EditorDictation extends Disposable implements IEditorContribution {

	static readonly ID = 'editorDictation';

	static get(editor: ICodeEditor): EditorDictation | null {
		return editor.getContribution<EditorDictation>(EditorDictation.ID);
	}

	private readonly widget = this._register(new DictationWidget(this.editor));
	private readonly editorDictationInProgress = EDITOR_DICTATION_IN_PROGRESS.bindTo(this.contextKeyService);

	private finishCallback?: (abort: boolean) => void;

	constructor(
		private readonly editor: ICodeEditor,
		@ISpeechService private readonly speechService: ISpeechService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this._register(this.widget.onDidBlur(() => this.finishCallback?.(true)));
	}

	start() {
		this.finishCallback?.(true);

		const cts = new CancellationTokenSource();
		this.widget.show();
		this.editorDictationInProgress.set(true);

		let message: string | undefined;
		let preview: string | undefined;
		const session = this.speechService.createSpeechToTextSession(cts.token);
		const listener = session.onDidChange(e => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			switch (e.status) {
				case SpeechToTextStatus.Started:
					this.widget.active();
					break;
				case SpeechToTextStatus.Stopped:
					break;
				case SpeechToTextStatus.Recognizing:
					this.editor.executeEdits('editorDictation', [
						EditOperation.insert(this.editor.getPosition()!, e.text!)
					]);

					break;
				case SpeechToTextStatus.Recognized:
					message = !message ? e.text : `${message} ${e.text}`;
					preview = '';
					break;
			}
		});

		this.finishCallback = (abort: boolean) => {
			cts.dispose(true);
			listener.dispose();
			this.widget.hide();
			this.editorDictationInProgress.reset();
		};
	}

	stop(): void {
		this.finishCallback?.(false);
	}

	cancel(): void {
		this.finishCallback?.(true);
	}

	override dispose(): void {
		super.dispose();

		this.finishCallback?.(true);
		this.editorDictationInProgress.reset();
	}
}
