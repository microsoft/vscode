/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import * as browser from 'vs/base/browser/browser';
import { onUnexpectedError } from 'vs/base/common/errors';
import { matchesFuzzy } from 'vs/base/common/filters';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IHighlight, QuickOpenEntryGroup, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IAutoFocus, Mode, IEntryRunContext } from 'vs/base/parts/quickopen/common/quickOpen';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { IEditor, IEditorAction } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { BaseEditorQuickOpenAction } from 'vs/editor/standalone/browser/quickOpen/editorQuickOpen';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { QuickCommandNLS } from 'vs/editor/common/standaloneStrings';

export class EditorActionCommandEntry extends QuickOpenEntryGroup {
	private readonly key: string;
	private readonly action: IEditorAction;
	private readonly editor: IEditor;
	private readonly keyAriaLabel: string;

	constructor(key: string, keyAriaLabel: string, highlights: IHighlight[], action: IEditorAction, editor: IEditor) {
		super();

		this.key = key;
		this.keyAriaLabel = keyAriaLabel;
		this.setHighlights(highlights);
		this.action = action;
		this.editor = editor;
	}

	public getLabel(): string {
		return this.action.label;
	}

	public getAriaLabel(): string {
		if (this.keyAriaLabel) {
			return strings.format(QuickCommandNLS.ariaLabelEntryWithKey, this.getLabel(), this.keyAriaLabel);
		}

		return strings.format(QuickCommandNLS.ariaLabelEntry, this.getLabel());
	}

	public getGroupLabel(): string {
		return this.key;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {

			// Use a timeout to give the quick open widget a chance to close itself first
			setTimeout(() => {

				// Some actions are enabled only when editor has focus
				this.editor.focus();

				try {
					let promise = this.action.run() || Promise.resolve();
					promise.then(undefined, onUnexpectedError);
				} catch (error) {
					onUnexpectedError(error);
				}
			}, 50);

			return true;
		}

		return false;
	}
}

export class QuickCommandAction extends BaseEditorQuickOpenAction {

	constructor() {
		super(QuickCommandNLS.quickCommandActionInput, {
			id: 'editor.action.quickCommand',
			label: QuickCommandNLS.quickCommandActionLabel,
			alias: 'Command Palette',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: (browser.isIE ? KeyMod.Alt | KeyCode.F1 : KeyCode.F1),
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				group: 'z_commands',
				order: 1
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const keybindingService = accessor.get(IKeybindingService);

		this._show(this.getController(editor), {
			getModel: (value: string): QuickOpenModel => {
				return new QuickOpenModel(this._editorActionsToEntries(keybindingService, editor, value));
			},

			getAutoFocus: (searchValue: string): IAutoFocus => {
				return {
					autoFocusFirstEntry: true,
					autoFocusPrefixMatch: searchValue
				};
			}
		});
	}

	private _sort(elementA: QuickOpenEntryGroup, elementB: QuickOpenEntryGroup): number {
		let elementAName = (elementA.getLabel() || '').toLowerCase();
		let elementBName = (elementB.getLabel() || '').toLowerCase();

		return elementAName.localeCompare(elementBName);
	}

	private _editorActionsToEntries(keybindingService: IKeybindingService, editor: ICodeEditor, searchValue: string): EditorActionCommandEntry[] {
		let actions: IEditorAction[] = editor.getSupportedActions();
		let entries: EditorActionCommandEntry[] = [];

		for (const action of actions) {

			let keybinding = keybindingService.lookupKeybinding(action.id);

			if (action.label) {
				let highlights = matchesFuzzy(searchValue, action.label);
				if (highlights) {
					entries.push(new EditorActionCommandEntry(keybinding ? keybinding.getLabel() || '' : '', keybinding ? keybinding.getAriaLabel() || '' : '', highlights, action, editor));
				}
			}
		}

		// Sort by name
		entries = entries.sort(this._sort);

		return entries;
	}
}

registerEditorAction(QuickCommandAction);
