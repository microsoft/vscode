/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { INTERACTIVE_SESSION_CATEGORY } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { IInteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSession';
import { CONTEXT_INTERACTIVE_INPUT_HAS_TEXT, CONTEXT_INTERACTIVE_REQUEST_IN_PROGRESS } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContextKeys';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';

export interface IInteractiveSessionExecuteActionContext {
	widget: IInteractiveSessionWidget;
}

function isExecuteActionContext(thing: unknown): thing is IInteractiveSessionExecuteActionContext {
	return typeof thing === 'object' && thing !== null && 'widget' in thing;
}

export function registerInteractiveSessionExecuteActions() {
	registerAction2(class SubmitAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.submit',
				title: {
					value: localize('interactive.submit.label', "Submit"),
					original: 'Submit'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.send,
				precondition: CONTEXT_INTERACTIVE_INPUT_HAS_TEXT,
				menu: {
					id: MenuId.InteractiveSessionExecute,
					when: CONTEXT_INTERACTIVE_REQUEST_IN_PROGRESS.negate(),
					group: 'navigation',
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (!isExecuteActionContext(context)) {
				return;
			}

			context.widget.acceptInput();
		}
	});

	registerAction2(class SubmitAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.cancel',
				title: {
					value: localize('interactive.cancel.label', "Cancel"),
					original: 'Cancel'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.debugStop,
				menu: {
					id: MenuId.InteractiveSessionExecute,
					when: CONTEXT_INTERACTIVE_REQUEST_IN_PROGRESS,
					group: 'navigation',
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (!isExecuteActionContext(context)) {
				return;
			}

			const interactiveSessionService = accessor.get(IInteractiveSessionService);
			if (context.widget.viewModel) {
				interactiveSessionService.cancelCurrentRequestForSession(context.widget.viewModel.sessionId);
			}
		}
	});
}
