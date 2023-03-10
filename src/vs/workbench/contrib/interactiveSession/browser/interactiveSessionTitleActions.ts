/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { INTERACTIVE_SESSION_CATEGORY } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { isRequestVM, isResponseVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';

export function registerInteractiveSessionTitleActions() {
	registerAction2(class VoteUpAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.voteUp',
				title: {
					value: localize('interactive.voteUp.label', "Vote Up"),
					original: 'Vote Up'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.thumbsup,
				menu: {
					id: MenuId.InteractiveSessionTitle,
					group: 'navigation',
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isRequestVM(item) && !isResponseVM(item)) {
				return;
			}

			// TODO call provider method
		}
	});

	registerAction2(class VoteDownAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.voteDown',
				title: {
					value: localize('interactive.voteDown.label', "Vote Down"),
					original: 'Vote Down'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.thumbsdown,
				menu: {
					id: MenuId.InteractiveSessionTitle,
					group: 'navigation',
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isRequestVM(item) && !isResponseVM(item)) {
				return;
			}

			// TODO call provider method
		}
	});
}
