/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';

export class AcceptSlashCommand extends Action2 {
	static readonly ID = 'workbench.action.chat.acceptSlashCommand';

	constructor() {
		super({
			id: AcceptSlashCommand.ID,
			title: {
				value: localize('interactive.submit.label', "Submit"),
				original: 'Submit'
			},
			f1: false,
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context = args[0];
		if (!context || !('widget' in context) || typeof context.widget.acceptInput !== 'function') {
			return;
		}
		(context.widget as IChatWidget).acceptInput();
	}
}

export function registerSlashCommandActions() {
	registerAction2(AcceptSlashCommand);
}
