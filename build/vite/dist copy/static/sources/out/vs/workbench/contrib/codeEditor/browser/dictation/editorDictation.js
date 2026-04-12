/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EditorDictation_1;
import './editorDictation.css';
import { localize, localize2 } from '../../../../../nls.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { HasSpeechProvider, ISpeechService, SpeechToTextInProgress, SpeechToTextStatus } from '../../../speech/common/speechService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { EditorAction2, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
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
const EDITOR_DICTATION_IN_PROGRESS = new RawContextKey('editorDictation.inProgress', false);
const VOICE_CATEGORY = localize2('voiceCategory', "Voice");
export class EditorDictationStartAction extends EditorAction2 {
    constructor() {
        super({
            id: 'workbench.action.editorDictation.start',
            title: localize2('startDictation', "Start Dictation in Editor"),
            category: VOICE_CATEGORY,
            precondition: ContextKeyExpr.and(HasSpeechProvider, SpeechToTextInProgress.toNegated(), // disable when any speech-to-text is in progress
            EditorContextKeys.readOnly.toNegated() // disable in read-only editors
            ),
            f1: true,
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 52 /* KeyCode.KeyV */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                secondary: isWindows ? [
                    512 /* KeyMod.Alt */ | 91 /* KeyCode.Backquote */
                ] : undefined
            }
        });
    }
    runEditorCommand(accessor, editor) {
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
    static { this.ID = 'workbench.action.editorDictation.stop'; }
    constructor() {
        super({
            id: EditorDictationStopAction.ID,
            title: localize2('stopDictation', "Stop Dictation in Editor"),
            category: VOICE_CATEGORY,
            precondition: EDITOR_DICTATION_IN_PROGRESS,
            f1: true,
            keybinding: {
                primary: 9 /* KeyCode.Escape */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 100
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        EditorDictation.get(editor)?.stop();
    }
}
export class DictationWidget extends Disposable {
    constructor(editor, keybindingService) {
        super();
        this.editor = editor;
        this.suppressMouseDown = true;
        this.allowEditorOverflow = true;
        this.domNode = document.createElement('div');
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
    getId() {
        return 'editorDictation';
    }
    getDomNode() {
        return this.domNode;
    }
    getPosition() {
        if (!this.editor.hasModel()) {
            return null;
        }
        const selection = this.editor.getSelection();
        return {
            position: selection.getPosition(),
            preference: [
                selection.getPosition().equals(selection.getStartPosition()) ? 1 /* ContentWidgetPositionPreference.ABOVE */ : 2 /* ContentWidgetPositionPreference.BELOW */,
                0 /* ContentWidgetPositionPreference.EXACT */
            ]
        };
    }
    beforeRender() {
        const position = this.editor.getPosition();
        const lineHeight = position ? this.editor.getLineHeightForPosition(position) : this.editor.getOption(75 /* EditorOption.lineHeight */);
        const width = this.editor.getLayoutInfo().contentWidth * 0.7;
        this.domNode.style.setProperty('--vscode-editor-dictation-widget-height', `${lineHeight}px`);
        this.domNode.style.setProperty('--vscode-editor-dictation-widget-width', `${width}px`);
        return null;
    }
    show() {
        this.editor.addContentWidget(this);
    }
    layout() {
        this.editor.layoutContentWidget(this);
    }
    active() {
        this.domNode.classList.add('recording');
    }
    hide() {
        this.domNode.classList.remove('recording');
        this.editor.removeContentWidget(this);
    }
}
let EditorDictation = class EditorDictation extends Disposable {
    static { EditorDictation_1 = this; }
    static { this.ID = 'editorDictation'; }
    static get(editor) {
        return editor.getContribution(EditorDictation_1.ID);
    }
    constructor(editor, speechService, contextKeyService, keybindingService) {
        super();
        this.editor = editor;
        this.speechService = speechService;
        this.sessionDisposables = this._register(new MutableDisposable());
        this.widget = this._register(new DictationWidget(this.editor, keybindingService));
        this.editorDictationInProgress = EDITOR_DICTATION_IN_PROGRESS.bindTo(contextKeyService);
    }
    async start() {
        const disposables = new DisposableStore();
        this.sessionDisposables.value = disposables;
        this.widget.show();
        disposables.add(toDisposable(() => this.widget.hide()));
        this.editorDictationInProgress.set(true);
        disposables.add(toDisposable(() => this.editorDictationInProgress.reset()));
        const collection = this.editor.createDecorationsCollection();
        disposables.add(toDisposable(() => collection.clear()));
        disposables.add(this.editor.onDidChangeCursorPosition(() => this.widget.layout()));
        let previewStart = undefined;
        let lastReplaceTextLength = 0;
        const replaceText = (text, isPreview) => {
            if (!previewStart) {
                previewStart = assertReturnsDefined(this.editor.getPosition());
            }
            const endPosition = new Position(previewStart.lineNumber, previewStart.column + text.length);
            this.editor.executeEdits(EditorDictation_1.ID, [
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
            }
            else {
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
    stop() {
        this.sessionDisposables.clear();
    }
};
EditorDictation = EditorDictation_1 = __decorate([
    __param(1, ISpeechService),
    __param(2, IContextKeyService),
    __param(3, IKeybindingService)
], EditorDictation);
export { EditorDictation };
registerEditorContribution(EditorDictation.ID, EditorDictation, 4 /* EditorContributionInstantiation.Lazy */);
registerAction2(EditorDictationStartAction);
registerAction2(EditorDictationStopAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yRGljdGF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29kZUVkaXRvci9icm93c2VyL2RpY3RhdGlvbi9lZGl0b3JEaWN0YXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sdUJBQXVCLENBQUM7QUFDL0IsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUd2SCxPQUFPLEVBQUUsY0FBYyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pJLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4SSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFakUsT0FBTyxFQUFFLGFBQWEsRUFBbUMsMEJBQTBCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMvSSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUl0RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbkYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUs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