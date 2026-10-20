/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { IChatWidget, isIChatViewViewContext } from '../../chat.js';
import { ChatSessionPosition, openChatSession } from '../../chatSessions/chatSessions.contribution.js';
import { IAgentHostPolicyContinuationPresenter } from './agentHostPolicyContinuation.js';

export class EditorAgentHostPolicyContinuationPresenter implements IAgentHostPolicyContinuationPresenter {
	declare readonly _serviceBrand: undefined;

	constructor(@IInstantiationService private readonly _instantiationService: IInstantiationService) { }

	async open(resource: URI, source: IChatWidget, ensureSourceCurrent: () => void): Promise<void> {
		const sidebar = isIChatViewViewContext(source.viewContext);
		const opened = await this._instantiationService.invokeFunction(openChatSession, {
			type: SessionType.AgentHostCopilot,
			displayName: localize('agentHost.policyContinuation.provider', "Copilot"),
			position: sidebar ? ChatSessionPosition.Sidebar : ChatSessionPosition.Editor,
			sessionResource: resource,
			replaceEditorForResource: sidebar ? undefined : source.viewModel?.sessionResource,
			beforeOpen: ensureSourceCurrent,
		});
		if (!isEqual(opened, resource)) {
			throw new Error(localize('agentHost.policyContinuation.openFailed', "Couldn't open the copied conversation in Copilot. Your original conversation is still available."));
		}
	}
}
