/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class ChatHistoryVariables extends Disposable {
	constructor(
		@IChatVariablesService chatVariablesService: IChatVariablesService,
	) {
		super();

		this._register(chatVariablesService.registerVariable({ name: 'response', description: '', canTakeArgument: true, hidden: true }, async (message, arg, model, token) => {
			if (!arg) {
				return undefined;
			}

			const responseNum = parseInt(arg, 10);
			const response = model.getRequests()[responseNum - 1].response;
			if (!response) {
				return undefined;
			}

			return [{ level: 'full', value: response.response.asString() }];
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ChatHistoryVariables, LifecyclePhase.Eventually);
