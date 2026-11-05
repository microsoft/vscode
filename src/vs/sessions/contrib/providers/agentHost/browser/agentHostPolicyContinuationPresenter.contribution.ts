/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IAgentHostPolicyContinuationPresenter } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostPolicyContinuation.js';
import { SessionsAgentHostPolicyContinuationPresenter } from '../../../../../workbench/contrib/sessions/providers/agentHost/browser/agentHostPolicyContinuationPresenter.js';

// The shared chat widget requires this presenter even when no local agent host is available.
registerSingleton(IAgentHostPolicyContinuationPresenter, SessionsAgentHostPolicyContinuationPresenter, InstantiationType.Delayed);
