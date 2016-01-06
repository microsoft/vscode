/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import Errors = require('vs/base/common/errors');
import EditorCommon = require('vs/editor/common/editorCommon');
import QuickOpenWidget = require('vs/base/parts/quickopen/browser/quickOpenWidget');
import QuickOpenModel = require('vs/base/parts/quickopen/browser/quickOpenModel');
import QuickOpen = require('vs/base/parts/quickopen/common/quickOpen');
import Strings = require('vs/base/common/strings');
import Actions = require('vs/base/common/actions');
import Filters = require('vs/base/common/filters');
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import EditorQuickOpen = require('./editorQuickOpen');
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';

export class EditorActionCommandEntry extends QuickOpenModel.QuickOpenEntryGroup {
	private key:string;
	private action:Actions.IAction;
	private editor:EditorCommon.IEditor;

	constructor(key:string, highlights:QuickOpenModel.IHighlight[], action:Actions.IAction, editor:EditorCommon.IEditor) {
		super();

		this.key = key;
		this.setHighlights(highlights);
		this.action = action;
		this.editor = editor;
	}

	public getLabel():string {
		return this.action.label;
	}

	public getGroupLabel():string {
		return this.key;
	}

	public run(mode:QuickOpen.Mode, context:QuickOpenModel.IContext):boolean {
		if (mode === QuickOpen.Mode.OPEN) {

			// Use a timeout to give the quick open widget a chance to close itself first
			TPromise.timeout(50).done(()=>{

				// Some actions are enabled only when editor has focus
				this.editor.focus();

				if (this.action.enabled) {
					try {
						var promise = this.action.run() || TPromise.as(null);
						promise.done(null, Errors.onUnexpectedError);
					} catch (error) {
						Errors.onUnexpectedError(error);
					}
				}
			}, Errors.onUnexpectedError);

			return true;
		}

		return false;
	}
}

export class QuickCommandAction extends EditorQuickOpen.BaseEditorQuickOpenAction {

	public static ID = 'editor.action.quickCommand';

	private _keybindingService: IKeybindingService;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @IKeybindingService keybindingService: IKeybindingService) {
		super(descriptor, editor, nls.localize('QuickCommandAction.label', "Command Palette"), Behaviour.WidgetFocus | Behaviour.ShowInContextMenu);
		this._keybindingService = keybindingService;
	}

	_getModel(value:string):QuickOpenModel.QuickOpenModel {
		var model = new QuickOpenModel.QuickOpenModel();

		var editorActions = this.editor.getActions();
		var entries = this._editorActionsToEntries(editorActions, value);

		model.addEntries(entries);

		return model;
	}

	public getGroupId(): string {
		return '4_tools/1_commands';
	}

	_sort(elementA:QuickOpenModel.QuickOpenEntryGroup, elementB:QuickOpenModel.QuickOpenEntryGroup):number {
		var elementAName = elementA.getLabel().toLowerCase();
		var elementBName = elementB.getLabel().toLowerCase();

		return Strings.localeCompare(elementAName, elementBName);
	}

	_editorActionsToEntries(actions:Actions.IAction[], searchValue:string):EditorActionCommandEntry[] {
		var entries:EditorActionCommandEntry[] = [];

		for (var i = 0; i < actions.length; i++) {
			var action = actions[i];

			var editorAction = <EditorAction>action;

			if (!editorAction.isSupported()) {
				continue; // do not show actions that are not supported in this context
			}

			var keys = this._keybindingService.lookupKeybindings(editorAction.id).map(k => this._keybindingService.getLabelFor(k));

			if (action.label) {
				var highlights = Filters.matchesFuzzy(searchValue, action.label);
				if (highlights) {
					entries.push(new EditorActionCommandEntry(keys.length > 0 ? keys.join(', ') : '', highlights, action, this.editor));
				}
			}
		}

		// Sort by name
		entries = entries.sort(this._sort);

		return entries;
	}

	_getAutoFocus(searchValue:string):QuickOpen.IAutoFocus {
		return {
			autoFocusFirstEntry: true,
			autoFocusPrefixMatch: searchValue
		};
	}

	_getInputAriaLabel(): string {
		return nls.localize('quickCommandActionInput', "Type the name of an action you want to execute");
	}
}