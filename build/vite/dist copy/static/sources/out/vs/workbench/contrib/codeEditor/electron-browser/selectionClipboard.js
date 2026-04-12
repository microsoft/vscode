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
var SelectionClipboard_1;
import * as nls from '../../../../nls.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as platform from '../../../../base/common/platform.js';
import { registerEditorContribution, EditorAction, registerEditorAction } from '../../../../editor/browser/editorExtensions.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { SelectionClipboardContributionID } from '../browser/selectionClipboard.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { addDisposableListener, onDidRegisterWindow } from '../../../../base/browser/dom.js';
let SelectionClipboard = class SelectionClipboard extends Disposable {
    static { SelectionClipboard_1 = this; }
    static { this.SELECTION_LENGTH_LIMIT = 65536; }
    constructor(editor, clipboardService) {
        super();
        if (platform.isLinux) {
            let isEnabled = editor.getOption(121 /* EditorOption.selectionClipboard */);
            this._register(editor.onDidChangeConfiguration((e) => {
                if (e.hasChanged(121 /* EditorOption.selectionClipboard */)) {
                    isEnabled = editor.getOption(121 /* EditorOption.selectionClipboard */);
                }
            }));
            const setSelectionToClipboard = this._register(new RunOnceScheduler(() => {
                if (!editor.hasModel()) {
                    return;
                }
                const model = editor.getModel();
                let selections = editor.getSelections();
                selections = selections.slice(0);
                selections.sort(Range.compareRangesUsingStarts);
                let resultLength = 0;
                for (const sel of selections) {
                    if (sel.isEmpty()) {
                        // Only write if all cursors have selection
                        return;
                    }
                    resultLength += model.getValueLengthInRange(sel);
                }
                if (resultLength > SelectionClipboard_1.SELECTION_LENGTH_LIMIT) {
                    // This is a large selection!
                    // => do not write it to the selection clipboard
                    return;
                }
                const result = [];
                for (const sel of selections) {
                    result.push(model.getValueInRange(sel, 0 /* EndOfLinePreference.TextDefined */));
                }
                const textToCopy = result.join(model.getEOL());
                clipboardService.writeText(textToCopy, 'selection');
            }, 100));
            this._register(editor.onDidChangeCursorSelection((e) => {
                if (!isEnabled) {
                    return;
                }
                if (e.source === 'restoreState') {
                    // do not set selection to clipboard if this selection change
                    // was caused by restoring editors...
                    return;
                }
                setSelectionToClipboard.schedule();
            }));
        }
    }
    dispose() {
        super.dispose();
    }
};
SelectionClipboard = SelectionClipboard_1 = __decorate([
    __param(1, IClipboardService)
], SelectionClipboard);
export { SelectionClipboard };
let LinuxSelectionClipboardPastePreventer = class LinuxSelectionClipboardPastePreventer extends Disposable {
    static { this.ID = 'workbench.contrib.linuxSelectionClipboardPastePreventer'; }
    constructor(configurationService) {
        super();
        this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
            disposables.add(addDisposableListener(window.document, 'mouseup', e => {
                if (e.button === 1) {
                    // middle button
                    const config = configurationService.getValue('editor');
                    if (!config.selectionClipboard) {
                        // selection clipboard is disabled
                        // try to stop the upcoming paste
                        e.preventDefault();
                    }
                }
            }));
        }, { window: mainWindow, disposables: this._store }));
    }
};
LinuxSelectionClipboardPastePreventer = __decorate([
    __param(0, IConfigurationService)
], LinuxSelectionClipboardPastePreventer);
class PasteSelectionClipboardAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.selectionClipboardPaste',
            label: nls.localize2('actions.pasteSelectionClipboard', "Paste Selection Clipboard"),
            precondition: EditorContextKeys.writable
        });
    }
    async run(accessor, editor, args) {
        const clipboardService = accessor.get(IClipboardService);
        // read selection clipboard
        const text = await clipboardService.readText('selection');
        editor.trigger('keyboard', "paste" /* Handler.Paste */, {
            text: text,
            pasteOnNewLine: false,
            multicursorText: null
        });
    }
}
registerEditorContribution(SelectionClipboardContributionID, SelectionClipboard, 0 /* EditorContributionInstantiation.Eager */); // eager because it needs to listen to selection change events
if (platform.isLinux) {
    registerWorkbenchContribution2(LinuxSelectionClipboardPastePreventer.ID, LinuxSelectionClipboardPastePreventer, 2 /* WorkbenchPhase.BlockRestore */); // eager because it listens to mouse-up events globally
    registerEditorAction(PasteSelectionClipboardAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VsZWN0aW9uQ2xpcGJvYXJkLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29kZUVkaXRvci9lbGVjdHJvbi1icm93c2VyL3NlbGVjdGlvbkNsaXBib2FyZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxLQUFLLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUVoRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsWUFBWSxFQUFvQixvQkFBb0IsRUFBbUMsTUFBTSxnREFBZ0QsQ0FBQztBQUduTCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHaEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEYsT0FBTyxFQUEwQyw4QkFBOEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzFILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFdEYsSUFBTSxrQkFBa0IsR0FBeEIs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