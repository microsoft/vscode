/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution, EditorAction, ServicesAccessor, registerEditorAction, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { ICursorSelectionChangedEvent } from 'vs/editor/common/cursorEvents';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution, Handler } from 'vs/editor/common/editorCommon';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { mainWindow } from 'vs/base/browser/window';
import { Event } from 'vs/base/common/event';
import { addDisposableListener, onDidRegisterWindow } from 'vs/base/browser/dom';

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
			label: nls.localize('actions.pasteSelectionClipboard', "Paste Selection Clipboard"),
			alias: 'Paste Selection Clipboard',
			precondition: EditorContextKeys.writable
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): Promise<void> {
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
