/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AI removed: the fork-conversation, continue-in-Copilot and export-agent-host
// logs actions are no longer registered. The two services remain because
// chat content parts and agent-host code still inject them.

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IChatResponseFileChangesService } from './chatResponseFileChangesService.js';
import { EditorChatResponseFileChangesService } from './editorChatResponseFileChangesService.js';
import { IAgentHostPolicyContinuationPresenter } from './agentSessions/agentHost/agentHostPolicyContinuation.js';
import { EditorAgentHostPolicyContinuationPresenter } from './agentSessions/agentHost/agentHostPolicyContinuationEditor.js';

registerSingleton(IChatResponseFileChangesService, EditorChatResponseFileChangesService, InstantiationType.Delayed);
registerSingleton(IAgentHostPolicyContinuationPresenter, EditorAgentHostPolicyContinuationPresenter, InstantiationType.Delayed);
