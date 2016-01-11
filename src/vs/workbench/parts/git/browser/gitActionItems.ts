/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as Keyboard from 'vs/base/browser/keyboardEvent';
import * as Builder from 'vs/base/browser/builder';
import * as Strings from 'vs/base/common/strings';
import * as Actions from 'vs/base/common/actions';
import * as InputBox from 'vs/base/browser/ui/inputbox/inputBox';
import * as ActionBar from 'vs/base/browser/ui/actionbar/actionbar';
import * as git from 'vs/workbench/parts/git/common/git';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {CommonKeybindings} from 'vs/base/common/keyCodes';

import IGitService = git.IGitService;

var $ = Builder.$;

export class CreateBranchActionItem extends ActionBar.BaseActionItem  {

	private contextViewService: IContextViewService;
	private gitService: IGitService;
	private inputBox: InputBox.InputBox;

	constructor(action: Actions.IAction, @IContextViewService contextViewService: IContextViewService, @IGitService gitService: IGitService) {
		super(null, action);
		this.contextViewService = contextViewService;
		this.gitService = gitService;
	}

	public render(container:HTMLElement): void {
		this.inputBox = new InputBox.InputBox(container, this.contextViewService, {
			placeholder: nls.localize('createNewBranch', "Create New Branch"),
			validationOptions: {
				showMessage: false,
				validation: v => this.validate(v)
			}
		});

		$(this.inputBox.inputElement).on('keyup', (e: KeyboardEvent) => this.onKeyUp(e));

		this._updateEnabled();
	}

	public _updateEnabled(): void {
		if (this._action.enabled) {
			this.inputBox.enable();
		} else {
			this.inputBox.disable();
		}
	}

	public focus(): void {
		this.inputBox.focus();
	}

	public blur(): void {
		// no-op
	}

	private validate(value: string): InputBox.IMessage {
		if (/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|^\s*$/.test(value)) {
			return { content: nls.localize('invalidBranchName', "Invalid branch name.") };
		}

		var model = this.gitService.getModel();
		var heads = model.getHeads();

		if (heads.some(h => h.name === value)) {
			return { content: nls.localize('dupeBranchName', "Branch name already exists.") };
		}

		return null;
	}

	private onKeyUp(e: KeyboardEvent): void {
		var event = new Keyboard.StandardKeyboardEvent(e);

		if (event.equals(CommonKeybindings.ENTER)) {
			event.preventDefault();
			event.stopPropagation();

			if (this.validate(this.inputBox.value)) {
				return;
			}

			var context = Strings.trim(this.inputBox.value);
			this.actionRunner.run(this._action, context).done();
		}
	}

	public dispose(): void {
		this.inputBox.dispose();

		super.dispose();
	}
}
