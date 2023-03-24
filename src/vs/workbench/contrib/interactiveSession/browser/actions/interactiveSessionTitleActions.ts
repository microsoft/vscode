/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { INTERACTIVE_SESSION_CATEGORY } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { CONTEXT_RESPONSE_VOTE } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContextKeys';
import { IInteractiveSessionService, IInteractiveSessionUserActionEvent, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { isResponseVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';

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
				toggled: CONTEXT_RESPONSE_VOTE.isEqualTo('up'),
				menu: {
					id: MenuId.InteractiveSessionTitle,
					group: 'navigation',
					order: 1
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}

			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			interactiveSessionService.notifyUserAction(<IInteractiveSessionUserActionEvent>{
				providerId: item.providerId,
				action: {
					kind: 'vote',
					direction: InteractiveSessionVoteDirection.Up,
					responseId: item.providerResponseId
				}
			});
			item.setVote(InteractiveSessionVoteDirection.Up);
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
				toggled: CONTEXT_RESPONSE_VOTE.isEqualTo('down'),
				menu: {
					id: MenuId.InteractiveSessionTitle,
					group: 'navigation',
					order: 2
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isResponseVM(item)) {
				return;
			}

			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			interactiveSessionService.notifyUserAction(<IInteractiveSessionUserActionEvent>{
				providerId: item.providerId,
				action: {
					kind: 'vote',
					direction: InteractiveSessionVoteDirection.Down,
					responseId: item.providerResponseId
				}
			});
			item.setVote(InteractiveSessionVoteDirection.Down);
		}
	});
}
