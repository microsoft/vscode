/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { RemoteNameContext } from '../../../common/contextkeys.js';
import { ChatAgentLocation, ChatMode } from './constants.js';

export namespace ChatContextKeys {
	export const responseVote = new RawContextKey<string>('chatSessionResponseVote', '', { type: 'string', description: localize('interactiveSessionResponseVote', "When the response has been voted up, is set to 'up'. When voted down, is set to 'down'. Otherwise an empty string.") });
	export const responseDetectedAgentCommand = new RawContextKey<boolean>('chatSessionResponseDetectedAgentOrCommand', false, { type: 'boolean', description: localize('chatSessionResponseDetectedAgentOrCommand', "When the agent or command was automatically detected") });
	export const responseSupportsIssueReporting = new RawContextKey<boolean>('chatResponseSupportsIssueReporting', false, { type: 'boolean', description: localize('chatResponseSupportsIssueReporting', "True when the current chat response supports issue reporting.") });
	export const responseIsFiltered = new RawContextKey<boolean>('chatSessionResponseFiltered', false, { type: 'boolean', description: localize('chatResponseFiltered', "True when the chat response was filtered out by the server.") });
	export const responseHasError = new RawContextKey<boolean>('chatSessionResponseError', false, { type: 'boolean', description: localize('chatResponseErrored', "True when the chat response resulted in an error.") });
	export const requestInProgress = new RawContextKey<boolean>('chatSessionRequestInProgress', false, { type: 'boolean', description: localize('interactiveSessionRequestInProgress', "True when the current request is still in progress.") });
	export const isRequestPaused = new RawContextKey<boolean>('chatRequestIsPaused', false, { type: 'boolean', description: localize('chatRequestIsPaused', "True when the current request is paused.") });
	export const canRequestBePaused = new RawContextKey<boolean>('chatCanRequestBePaused', false, { type: 'boolean', description: localize('chatCanRequestBePaused', "True when the current request can be paused.") });

	export const isResponse = new RawContextKey<boolean>('chatResponse', false, { type: 'boolean', description: localize('chatResponse', "The chat item is a response.") });
	export const isRequest = new RawContextKey<boolean>('chatRequest', false, { type: 'boolean', description: localize('chatRequest', "The chat item is a request") });
	export const itemId = new RawContextKey<string>('chatItemId', '', { type: 'string', description: localize('chatItemId', "The id of the chat item.") });
	export const lastItemId = new RawContextKey<string[]>('chatLastItemId', [], { type: 'string', description: localize('chatLastItemId', "The id of the last chat item.") });

	export const editApplied = new RawContextKey<boolean>('chatEditApplied', false, { type: 'boolean', description: localize('chatEditApplied', "True when the chat text edits have been applied.") });

	export const inputHasText = new RawContextKey<boolean>('chatInputHasText', false, { type: 'boolean', description: localize('interactiveInputHasText', "True when the chat input has text.") });
	export const inputHasFocus = new RawContextKey<boolean>('chatInputHasFocus', false, { type: 'boolean', description: localize('interactiveInputHasFocus', "True when the chat input has focus.") });
	export const inChatInput = new RawContextKey<boolean>('inChatInput', false, { type: 'boolean', description: localize('inInteractiveInput', "True when focus is in the chat input, false otherwise.") });
	export const inChatSession = new RawContextKey<boolean>('inChat', false, { type: 'boolean', description: localize('inChat', "True when focus is in the chat widget, false otherwise.") });
	export const hasPromptFile = new RawContextKey<boolean>('chatPromptFileAttached', false, { type: 'boolean', description: localize('chatPromptFileAttachedContextDescription', "True when the chat has a prompt file attached.") });
	export const chatMode = new RawContextKey<ChatMode>('chatMode', ChatMode.Ask, { type: 'string', description: localize('chatMode', "The current chat mode.") });

	export const supported = ContextKeyExpr.or(IsWebContext.negate(), RemoteNameContext.notEqualsTo('')); // supported on desktop and in web only with a remote connection
	export const enabled = new RawContextKey<boolean>('chatIsEnabled', false, { type: 'boolean', description: localize('chatIsEnabled', "True when chat is enabled because a default chat participant is activated with an implementation.") });

	export const extensionParticipantRegistered = new RawContextKey<boolean>('chatPanelExtensionParticipantRegistered', false, { type: 'boolean', description: localize('chatPanelExtensionParticipantRegistered', "True when a default chat participant is registered for the panel from an extension.") });
	export const panelParticipantRegistered = new RawContextKey<boolean>('chatPanelParticipantRegistered', false, { type: 'boolean', description: localize('chatParticipantRegistered', "True when a default chat participant is registered for the panel.") });
	export const editingParticipantRegistered = new RawContextKey<boolean>('chatEditingParticipantRegistered', false, { type: 'boolean', description: localize('chatEditingParticipantRegistered', "True when a default chat participant is registered for editing.") });
	export const chatEditingCanUndo = new RawContextKey<boolean>('chatEditingCanUndo', false, { type: 'boolean', description: localize('chatEditingCanUndo', "True when it is possible to undo an interaction in the editing panel.") });
	export const chatEditingCanRedo = new RawContextKey<boolean>('chatEditingCanRedo', false, { type: 'boolean', description: localize('chatEditingCanRedo', "True when it is possible to redo an interaction in the editing panel.") });
	export const extensionInvalid = new RawContextKey<boolean>('chatExtensionInvalid', false, { type: 'boolean', description: localize('chatExtensionInvalid', "True when the installed chat extension is invalid and needs to be updated.") });
	export const inputCursorAtTop = new RawContextKey<boolean>('chatCursorAtTop', false);
	export const inputHasAgent = new RawContextKey<boolean>('chatInputHasAgent', false);
	export const location = new RawContextKey<ChatAgentLocation>('chatLocation', undefined);
	export const inQuickChat = new RawContextKey<boolean>('quickChatHasFocus', false, { type: 'boolean', description: localize('inQuickChat', "True when the quick chat UI has focus, false otherwise.") });
	export const hasFileAttachments = new RawContextKey<boolean>('chatHasFileAttachments', false, { type: 'boolean', description: localize('chatHasFileAttachments', "True when the chat has file attachments.") });

	export const languageModelsAreUserSelectable = new RawContextKey<boolean>('chatModelsAreUserSelectable', false, { type: 'boolean', description: localize('chatModelsAreUserSelectable', "True when the chat model can be selected manually by the user.") });

	export const Setup = {
		hidden: new RawContextKey<boolean>('chatSetupHidden', false, true), 		// True when chat setup is explicitly hidden.
		installed: new RawContextKey<boolean>('chatSetupInstalled', false, true)  	// True when the chat extension is installed.
	};

	export const Entitlement = {
		signedOut: new RawContextKey<boolean>('chatSetupSignedOut', false, true), 	// True when user is signed out.
		canSignUp: new RawContextKey<boolean>('chatPlanCanSignUp', false, true), 	// True when user can sign up to be a chat limited user.
		limited: new RawContextKey<boolean>('chatPlanLimited', false, true),		// True when user is a chat limited user.
		pro: new RawContextKey<boolean>('chatPlanPro', false, true) 				// True when user is a chat pro user.
	};

	export const chatQuotaExceeded = new RawContextKey<boolean>('chatQuotaExceeded', false, true);
	export const completionsQuotaExceeded = new RawContextKey<boolean>('completionsQuotaExceeded', false, true);

	export const Editing = {
		agentModeDisallowed: new RawContextKey<boolean>('chatAgentModeDisallowed', undefined, { type: 'boolean', description: localize('chatAgentModeDisallowed', "True when agent mode is not allowed.") }), // experiment-driven disablement
		hasToolConfirmation: new RawContextKey<boolean>('chatHasToolConfirmation', false, { type: 'boolean', description: localize('chatEditingHasToolConfirmation', "True when a tool confirmation is present.") }),
	};

	export const Tools = {
		toolsCount: new RawContextKey<number>('toolsCount', 0, { type: 'number', description: localize('toolsCount', "The count of tools available in the chat.") })
	};
}

export namespace ChatContextKeyExprs {
	export const inEditingMode = ContextKeyExpr.or(
		ChatContextKeys.chatMode.isEqualTo(ChatMode.Edit),
		ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent),
	);
}
