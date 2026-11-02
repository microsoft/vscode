/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import './sessionChatViewEditor.js';
import { SessionsChatWindowProvider } from './sessionsChatWindowProvider.js';

/** Provides the chat windows of the Agents window: what they show of a session, their chrome and their look. */
export class SessionsChatWindowProviderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsChatWindowProvider';

	constructor(
		@IChatWindowService chatWindowService: IChatWindowService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const provider = this._register(instantiationService.createInstance(SessionsChatWindowProvider));
		this._register(chatWindowService.registerProvider(provider));
	}
}

registerWorkbenchContribution2(SessionsChatWindowProviderContribution.ID, SessionsChatWindowProviderContribution, WorkbenchPhase.BlockRestore);
