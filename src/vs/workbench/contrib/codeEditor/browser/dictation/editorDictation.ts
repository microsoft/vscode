/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './editorDictation.css';
import { localize, localize2 } from '../../../../../nls.js';
import { IDimension } from '../../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { HasSpeechProvider, ISpeechService, SpeechToTextInProgress, SpeechToTextStatus } from '../../../speech/common/speechService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { EditorAction2, EditorContributionInstantiation, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { toAction } from '../../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isWindows } from '../../../../../base/common/platform.js';

const EDITOR_DICTATION_IN_PROGRESS = new RawContextKey<boolean>('editorDictation.inProgress', false);
const VOICE_CATEGORY = localize2('voiceCategory', "Voice");

export class EditorDictationStartAction extends EditorAction2 {

	constructor() {
		super({
			id: 'workbench.action.editorDictation.start',
			title: localize2('startDictation', "Start Dictation in Editor"),
			category: VOICE_CATEGORY,
			precondition: ContextKeyExpr.and(
				HasSpeechProvider,
				SpeechToTextInProgress.toNegated(),		// disable when any speech-to-text is in progress
				EditorContextKeys.readOnly.toNegated()	// disable in read-only editors
			),
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyV,
				weight: KeybindingWeight.WorkbenchContrib,
				secondary: isWindows ? [
					KeyMod.Alt | KeyCode.Backquote
				] : undefined
			}
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
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

	static readonly ID = 'workbench.action.editorDictation.stop';

	constructor() {
		super({
			id: EditorDictationStopAction.ID,
			title: localize2('stopDictation', "Stop Dictation in Editor"),
			category: VOICE_CATEGORY,
			precondition: EDITOR_DICTATION_IN_PROGRESS,
			f1: true,
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib + 100
			}
		});
	}

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		EditorDictation.get(editor)?.stop();
	}
}

export class DictationWidget extends Disposable implements IContentWidget {

	readonly suppressMouseDown = true;
	readonly allowEditorOverflow = true;

	private readonly domNode = document.createElement('div');

	constructor(private readonly editor: ICodeEditor, keybindingService: IKeybindingService) {
		super();

		const actionBar = this._register(new ActionBar(this.domNode));
		const stopActionKeybinding = keybindingService.lookupKeybinding(EditorDictationStopAction.ID)?.getLabel();
		actionBar.push(toAction({
			id: EditorDictationStopAction.ID,
			label: stopActionKeybinding ? localize('stopDictationShort1', "Stop Dictation ({0})", stopActionKeybinding) : localize('stopDictationShort2', "Stop Dictation"),
			class: ThemeIcon.asClassName(Codicon.micFilled),
			run: () => EditorDictation.get(editor)?.stop()
		}), { icon: true, label: false, keybinding: stopActionKeybinding });

		this.domNode.classList.add('editor-dictation-widget');
		this.domNode.appendChild(actionBar.domNode);
	}

	getId(): string {
		return 'editorDictation';
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this.editor.hasModel()) {
			return null;
		}

		const selection = this.editor.getSelection();

		return {
			position: selection.getPosition(),
			preference: [
				selection.getPosition().equals(selection.getStartPosition()) ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW,
				ContentWidgetPositionPreference.EXACT
			]
		};
	}

	beforeRender(): IDimension | null {
		const position = this.editor.getPosition();
		const lineHeight = position ? this.editor.getLineHeightForPosition(position) : this.editor.getOption(EditorOption.lineHeight);
		const width = this.editor.getLayoutInfo().contentWidth * 0.7;

		this.domNode.style.setProperty('--vscode-editor-dictation-widget-height', `${lineHeight}px`);
		this.domNode.style.setProperty('--vscode-editor-dictation-widget-width', `${width}px`);

		return null;
	}

	show() {
		this.editor.addContentWidget(this);
	}

	layout(): void {
		this.editor.layoutContentWidget(this);
	}

	active(): void {
		this.domNode.classList.add('recording');
	}

	hide() {
		this.domNode.classList.remove('recording');
		this.editor.removeContentWidget(this);
	}
}

export class EditorDictation extends Disposable implements IEditorContribution {

	static readonly ID = 'editorDictation';

	static get(editor: ICodeEditor): EditorDictation | null {
		return editor.getContribution<EditorDictation>(EditorDictation.ID);
	}

	private readonly widget: DictationWidget;
	private readonly editorDictationInProgress: IContextKey<boolean>;

	private readonly sessionDisposables = this._register(new MutableDisposable());

	constructor(
		private readonly editor: ICodeEditor,
		@ISpeechService private readonly speechService: ISpeechService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super();

		this.widget = this._register(new DictationWidget(this.editor, keybindingService));
		this.editorDictationInProgress = EDITOR_DICTATION_IN_PROGRESS.bindTo(contextKeyService);
	}

	async start(): Promise<void> {
		const disposables = new DisposableStore();
		this.sessionDisposables.value = disposables;

		this.widget.show();
		disposables.add(toDisposable(() => this.widget.hide()));

		this.editorDictationInProgress.set(true);
		disposables.add(toDisposable(() => this.editorDictationInProgress.reset()));

		const collection = this.editor.createDecorationsCollection();
		disposables.add(toDisposable(() => collection.clear()));

		disposables.add(this.editor.onDidChangeCursorPosition(() => this.widget.layout()));

		let previewStart: Position | undefined = undefined;

		let lastReplaceTextLength = 0;
		const replaceText = (text: string, isPreview: boolean) => {
			if (!previewStart) {
				previewStart = assertReturnsDefined(this.editor.getPosition());
			}

			const endPosition = new Position(previewStart.lineNumber, previewStart.column + text.length);
			this.editor.executeEdits(EditorDictation.ID, [
				EditOperation.replace(Range.fromPositions(previewStart, previewStart.with(undefined, previewStart.column + lastReplaceTextLength)), text)
			], [
				Selection.fromPositions(endPosition)
			]);

			if (isPreview) {
				collection.set([
					{
						range: Range.fromPositions(previewStart, previewStart.with(undefined, previewStart.column + text.length)),
						options: {
							description: 'editor-dictation-preview',
							inlineClassName: 'ghost-text-decoration-preview'
						}
					}
				]);
			} else {
				collection.clear();
			}

			lastReplaceTextLength = text.length;
			if (!isPreview) {
				previewStart = undefined;
				lastReplaceTextLength = 0;
			}

			this.editor.revealPositionInCenterIfOutsideViewport(endPosition);
		};

		const cts = new CancellationTokenSource();
		disposables.add(toDisposable(() => cts.dispose(true)));

		const session = await this.speechService.createSpeechToTextSession(cts.token, 'editor');
		disposables.add(session.onDidChange(e => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			switch (e.status) {
				case SpeechToTextStatus.Started:
					this.widget.active();
					break;
				case SpeechToTextStatus.Stopped:
					disposables.dispose();
					break;
				case SpeechToTextStatus.Recognizing: {
					if (!e.text) {
						return;
					}

					replaceText(e.text, true);
					break;
				}
				case SpeechToTextStatus.Recognized: {
					if (!e.text) {
						return;
					}

					replaceText(`${e.text} `, false);
					break;
				}
			}
		}));
	}

	stop(): void {
		this.sessionDisposables.clear();
	}
}

registerEditorContribution(EditorDictation.ID, EditorDictation, EditorContributionInstantiation.Lazy);
registerAction2(EditorDictationStartAction);
registerAction2(EditorDictationStopAction);
