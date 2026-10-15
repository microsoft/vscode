/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AI removed: the inline chat UI (editor controller, actions, workbench
// contributions, accessibility help) is no longer registered. Only the session
// services remain, because notebook, editor-hint and chat-editing code still
// inject them. Both are inert without a chat agent.

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInlineChatSessionService } from './inlineChatSessionService.js';
import { InlineChatSessionServiceImpl } from './inlineChatSessionServiceImpl.js';
import { IInlineChatSessionResolver, InlineChatSessionResolver } from './inlineChatSessionResolver.js';

registerSingleton(IInlineChatSessionService, InlineChatSessionServiceImpl, InstantiationType.Delayed);
registerSingleton(IInlineChatSessionResolver, InlineChatSessionResolver, InstantiationType.Delayed);
