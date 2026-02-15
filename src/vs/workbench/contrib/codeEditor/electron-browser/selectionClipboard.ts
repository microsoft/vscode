/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as platform from '../../../../base/common/platform.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { registerEditorContribution, EditorAction, ServicesAccessor, registerEditorAction, EditorContributionInstantiation } from '../../../../editor/browser/editorExtensions.js';
import { ConfigurationChangedEvent, EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { ICursorSelectionChangedEvent } from '../../../../editor/common/cursorEvents.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IEditorContribution, Handler } from '../../../../editor/common/editorCommon.js';
import { EndOfLinePreference } from '../../../../editor/common/model.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { SelectionClipboardContributionID } from '../browser/selectionClipboard.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { addDisposableListener, onDidRegisterWindow } from '../../../../base/browser/dom.js';

export class SelectionClipboard extends Disposable implements IEditorContribution {
	private static readonly SELECTION_LENGTH_LIMIT = 65536;

	constructor(editor: ICodeEditor, @IClipboardService clipboardService: IClipboardService) {
		super();

		if (platform.isLinux) {
			let isEnabled = editor.getOption(EditorOption.selectionClipboard);

			this._register(editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
				if (e.hasChanged(EditorOption.selectionClipboard)) {
					isEnabled = editor.getOption(EditorOption.selectionClipboard);
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

				if (resultLength > SelectionClipboard.SELECTION_LENGTH_LIMIT) {
					// This is a large selection!
					// => do not write it to the selection clipboard
					return;
				}

				const result: string[] = [];
				for (const sel of selections) {
					result.push(model.getValueInRange(sel, EndOfLinePreference.TextDefined));
				}

				const textToCopy = result.join(model.getEOL());
				clipboardService.writeText(textToCopy, 'selection');
			}, 100));

			this._register(editor.onDidChangeCursorSelection((e: ICursorSelectionChangedEvent) => {
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

	public override dispose(): void {
		super.dispose();
	}
}

class LinuxSelectionClipboardPastePreventer extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.linuxSelectionClipboardPastePreventer';

	constructor(
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();

		this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
			disposables.add(addDisposableListener(window.document, 'mouseup', e => {
				if (e.button === 1) {
					// middle button
					const config = configurationService.getValue<{ selectionClipboard: boolean }>('editor');
					if (!config.selectionClipboard) {
						// selection clipboard is disabled
						// try to stop the upcoming paste
						e.preventDefault();
					}
				}
			}));
		}, { window: mainWindow, disposables: this._store }));
	}
}

class PasteSelectionClipboardAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.selectionClipboardPaste',
			label: nls.localize2('actions.pasteSelectionClipboard', "Paste Selection Clipboard"),
			precondition: EditorContextKeys.writable
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);

		// read selection clipboard
		const text = await clipboardService.readText('selection');

		editor.trigger('keyboard', Handler.Paste, {
			text: text,
			pasteOnNewLine: false,
			multicursorText: null
		});
	}
}

registerEditorContribution(SelectionClipboardContributionID, SelectionClipboard, EditorContributionInstantiation.Eager); // eager because it needs to listen to selection change events
if (platform.isLinux) {
	registerWorkbenchContribution2(LinuxSelectionClipboardPastePreventer.ID, LinuxSelectionClipboardPastePreventer, WorkbenchPhase.BlockRestore); // eager because it listens to mouse-up events globally
	registerEditorAction(PasteSelectionClipboardAction);
}
