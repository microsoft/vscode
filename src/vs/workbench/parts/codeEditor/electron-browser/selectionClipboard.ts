/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { clipboard } from 'electron';
import * as platform from 'vs/base/common/platform';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { Disposable } from 'vs/base/common/lifecycle';
import { EndOfLinePreference, IEditorContribution } from 'vs/editor/common/editorCommon';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Range } from 'vs/editor/common/core/range';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';

@editorContribution
export class SelectionClipboard extends Disposable implements IEditorContribution {

	private static ID = 'editor.contrib.selectionClipboard';

	constructor(editor: ICodeEditor, @IContextKeyService contextKeyService: IContextKeyService) {
		super();

		if (platform.isLinux) {
			let isEnabled = editor.getConfiguration().contribInfo.selectionClipboard;

			this._register(editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
				if (e.contribInfo) {
					isEnabled = editor.getConfiguration().contribInfo.selectionClipboard;
				}
			}));

			this._register(editor.onMouseDown((e: IEditorMouseEvent) => {
				if (!isEnabled) {
					return;
				}
				if (!editor.getModel()) {
					return;
				}
				if (e.event.middleButton) {
					e.event.preventDefault();
					editor.focus();

					if (e.target.position) {
						editor.setPosition(e.target.position);
					}

					process.nextTick(() => {
						// TODO@Alex: electron weirdness: calling clipboard.readText('selection') generates a paste event, so no need to execute paste ourselves
						clipboard.readText('selection');
						// keybindingService.executeCommand(Handler.Paste, {
						// 	text: clipboard.readText('selection'),
						// 	pasteOnNewLine: false
						// });
					});
				}
			}));

			let setSelectionToClipboard = this._register(new RunOnceScheduler(() => {
				let model = editor.getModel();
				if (!model) {
					return;
				}

				let selections = editor.getSelections();
				selections = selections.slice(0);
				selections.sort(Range.compareRangesUsingStarts);

				let result: string[] = [];
				for (let i = 0; i < selections.length; i++) {
					let sel = selections[i];
					if (sel.isEmpty()) {
						// Only write if all cursors have selection
						return;
					}
					result.push(model.getValueInRange(sel, EndOfLinePreference.TextDefined));
				}

				let textToCopy = result.join(model.getEOL());
				clipboard.writeText(textToCopy, 'selection');
			}, 100));

			this._register(editor.onDidChangeCursorSelection((e: ICursorSelectionChangedEvent) => {
				if (!isEnabled) {
					return;
				}
				setSelectionToClipboard.schedule();
			}));
		}
	}

	public getId(): string {
		return SelectionClipboard.ID;
	}

	public dispose(): void {
		super.dispose();
	}
}
