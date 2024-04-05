/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';

export const CONTEXT_RESPONSE_VOTE = new RawContextKey<string>('chatSessionResponseVote', '', { type: 'string', description: localize('interactiveSessionResponseVote', "When the response has been voted up, is set to 'up'. When voted down, is set to 'down'. Otherwise an empty string.") });
export const CONTEXT_RESPONSE_DETECTED_AGENT_COMMAND = new RawContextKey<boolean>('chatSessionResponseDetectedAgentOrCommand', false, { type: 'boolean', description: localize('chatSessionResponseDetectedAgentOrCommand', "When the agent or command was automatically detected") });
export const CONTEXT_CHAT_RESPONSE_SUPPORT_ISSUE_REPORTING = new RawContextKey<boolean>('chatResponseSupportsIssueReporting', false, { type: 'boolean', description: localize('chatResponseSupportsIssueReporting', "True when the current chat response supports issue reporting.") });
export const CONTEXT_RESPONSE_FILTERED = new RawContextKey<boolean>('chatSessionResponseFiltered', false, { type: 'boolean', description: localize('chatResponseFiltered', "True when the chat response was filtered out by the server.") });
export const CONTEXT_CHAT_REQUEST_IN_PROGRESS = new RawContextKey<boolean>('chatSessionRequestInProgress', false, { type: 'boolean', description: localize('interactiveSessionRequestInProgress', "True when the current request is still in progress.") });

export const CONTEXT_RESPONSE = new RawContextKey<boolean>('chatResponse', false, { type: 'boolean', description: localize('chatResponse', "The chat item is a response.") });
export const CONTEXT_REQUEST = new RawContextKey<boolean>('chatRequest', false, { type: 'boolean', description: localize('chatRequest', "The chat item is a request") });

export const CONTEXT_CHAT_INPUT_HAS_TEXT = new RawContextKey<boolean>('chatInputHasText', false, { type: 'boolean', description: localize('interactiveInputHasText', "True when the chat input has text.") });
export const CONTEXT_CHAT_INPUT_HAS_FOCUS = new RawContextKey<boolean>('chatInputHasFocus', false, { type: 'boolean', description: localize('interactiveInputHasFocus', "True when the chat input has focus.") });
export const CONTEXT_IN_CHAT_INPUT = new RawContextKey<boolean>('inChatInput', false, { type: 'boolean', description: localize('inInteractiveInput', "True when focus is in the chat input, false otherwise.") });
export const CONTEXT_IN_CHAT_SESSION = new RawContextKey<boolean>('inChat', false, { type: 'boolean', description: localize('inChat', "True when focus is in the chat widget, false otherwise.") });

export const CONTEXT_PROVIDER_EXISTS = new RawContextKey<boolean>('hasChatProvider', false, { type: 'boolean', description: localize('hasChatProvider', "True when some chat provider has been registered.") });
export const CONTEXT_CHAT_INPUT_CURSOR_AT_TOP = new RawContextKey<boolean>('chatCursorAtTop', false);
export const CONTEXT_CHAT_INPUT_HAS_AGENT = new RawContextKey<boolean>('chatInputHasAgent', false);
export const CONTEXT_CHAT_LOCATION = new RawContextKey<ChatAgentLocation>('chatLocation', undefined);
