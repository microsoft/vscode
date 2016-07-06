/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {IAction} from 'vs/base/common/actions';
import {onUnexpectedError} from 'vs/base/common/errors';
import {matchesFuzzy} from 'vs/base/common/filters';
import * as strings from 'vs/base/common/strings';
import {TPromise} from 'vs/base/common/winjs.base';
import {IContext, IHighlight, QuickOpenEntryGroup, QuickOpenModel} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {IAutoFocus, Mode} from 'vs/base/parts/quickopen/common/quickOpen';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import {ICommonCodeEditor, IEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import {BaseEditorQuickOpenAction} from './editorQuickOpen';

export class EditorActionCommandEntry extends QuickOpenEntryGroup {
	private key: string;
	private action: IAction;
	private editor: IEditor;

	constructor(key: string, highlights: IHighlight[], action: IAction, editor: IEditor) {
		super();

		this.key = key;
		this.setHighlights(highlights);
		this.action = action;
		this.editor = editor;
	}

	public getLabel(): string {
		return this.action.label;
	}

	public getAriaLabel(): string {
		return nls.localize('ariaLabelEntry', "{0}, commands", this.getLabel());
	}

	public getGroupLabel(): string {
		return this.key;
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {

			// Use a timeout to give the quick open widget a chance to close itself first
			TPromise.timeout(50).done(() => {

				// Some actions are enabled only when editor has focus
				this.editor.focus();

				if (this.action.enabled) {
					try {
						let promise = this.action.run() || TPromise.as(null);
						promise.done(null, onUnexpectedError);
					} catch (error) {
						onUnexpectedError(error);
					}
				}
			}, onUnexpectedError);

			return true;
		}

		return false;
	}
}

export class QuickCommandAction extends BaseEditorQuickOpenAction {

	public static ID = 'editor.action.quickCommand';

	private _keybindingService: IKeybindingService;

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IKeybindingService keybindingService: IKeybindingService) {
		super(descriptor, editor, nls.localize('QuickCommandAction.label', "Command Palette"), Behaviour.WidgetFocus | Behaviour.ShowInContextMenu);
		this._keybindingService = keybindingService;
	}

	_getModel(value: string): QuickOpenModel {
		return new QuickOpenModel(this._editorActionsToEntries(this.editor.getActions(), value));
	}

	public getGroupId(): string {
		return '4_tools/1_commands';
	}

	_sort(elementA: QuickOpenEntryGroup, elementB: QuickOpenEntryGroup): number {
		let elementAName = elementA.getLabel().toLowerCase();
		let elementBName = elementB.getLabel().toLowerCase();

		return strings.localeCompare(elementAName, elementBName);
	}

	_editorActionsToEntries(actions: IAction[], searchValue: string): EditorActionCommandEntry[] {
		let entries: EditorActionCommandEntry[] = [];

		for (let i = 0; i < actions.length; i++) {
			let action = actions[i];

			let editorAction = <EditorAction>action;

			if (!editorAction.isSupported()) {
				continue; // do not show actions that are not supported in this context
			}

			let keys = this._keybindingService.lookupKeybindings(editorAction.id).map(k => this._keybindingService.getLabelFor(k));

			if (action.label) {
				let highlights = matchesFuzzy(searchValue, action.label);
				if (highlights) {
					entries.push(new EditorActionCommandEntry(keys.length > 0 ? keys.join(', ') : '', highlights, action, this.editor));
				}
			}
		}

		// Sort by name
		entries = entries.sort(this._sort);

		return entries;
	}

	_getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: true,
			autoFocusPrefixMatch: searchValue
		};
	}

	_getInputAriaLabel(): string {
		return nls.localize('quickCommandActionInput', "Type the name of an action you want to execute");
	}
}