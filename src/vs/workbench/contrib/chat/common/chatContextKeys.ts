/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { RemoteNameContext } from '../../../common/contextkeys.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { ChatAgentLocation, ChatModeKind } from './constants.js';

export namespace ChatContextKeys {
	export const responseVote = new RawContextKey<string>('chatSessionResponseVote', '', { type: 'string', description: localize('interactiveSessionResponseVote', "When the response has been voted up, is set to 'up'. When voted down, is set to 'down'. Otherwise an empty string.") });
	export const responseDetectedAgentCommand = new RawContextKey<boolean>('chatSessionResponseDetectedAgentOrCommand', false, { type: 'boolean', description: localize('chatSessionResponseDetectedAgentOrCommand', "When the agent or command was automatically detected") });
	export const responseSupportsIssueReporting = new RawContextKey<boolean>('chatResponseSupportsIssueReporting', false, { type: 'boolean', description: localize('chatResponseSupportsIssueReporting', "True when the current chat response supports issue reporting.") });
	export const responseIsFiltered = new RawContextKey<boolean>('chatSessionResponseFiltered', false, { type: 'boolean', description: localize('chatResponseFiltered', "True when the chat response was filtered out by the server.") });
	export const responseHasError = new RawContextKey<boolean>('chatSessionResponseError', false, { type: 'boolean', description: localize('chatResponseErrored', "True when the chat response resulted in an error.") });
	export const requestInProgress = new RawContextKey<boolean>('chatSessionRequestInProgress', false, { type: 'boolean', description: localize('interactiveSessionRequestInProgress', "True when the current request is still in progress.") });
	export const currentlyEditing = new RawContextKey<boolean>('chatSessionCurrentlyEditing', false, { type: 'boolean', description: localize('interactiveSessionCurrentlyEditing', "True when the current request is being edited.") });
	export const currentlyEditingInput = new RawContextKey<boolean>('chatSessionCurrentlyEditingInput', false, { type: 'boolean', description: localize('interactiveSessionCurrentlyEditingInput', "True when the current request input at the bottom is being edited.") });

	export const isResponse = new RawContextKey<boolean>('chatResponse', false, { type: 'boolean', description: localize('chatResponse', "The chat item is a response.") });
	export const isRequest = new RawContextKey<boolean>('chatRequest', false, { type: 'boolean', description: localize('chatRequest', "The chat item is a request") });
	export const itemId = new RawContextKey<string>('chatItemId', '', { type: 'string', description: localize('chatItemId', "The id of the chat item.") });
	export const lastItemId = new RawContextKey<string[]>('chatLastItemId', [], { type: 'string', description: localize('chatLastItemId', "The id of the last chat item.") });

	export const editApplied = new RawContextKey<boolean>('chatEditApplied', false, { type: 'boolean', description: localize('chatEditApplied', "True when the chat text edits have been applied.") });

	export const inputHasText = new RawContextKey<boolean>('chatInputHasText', false, { type: 'boolean', description: localize('interactiveInputHasText', "True when the chat input has text.") });
	export const inputHasFocus = new RawContextKey<boolean>('chatInputHasFocus', false, { type: 'boolean', description: localize('interactiveInputHasFocus', "True when the chat input has focus.") });
	export const inChatInput = new RawContextKey<boolean>('inChatInput', false, { type: 'boolean', description: localize('inInteractiveInput', "True when focus is in the chat input, false otherwise.") });
	export const inChatSession = new RawContextKey<boolean>('inChat', false, { type: 'boolean', description: localize('inChat', "True when focus is in the chat widget, false otherwise.") });
	export const inChatEditor = new RawContextKey<boolean>('inChatEditor', false, { type: 'boolean', description: localize('inChatEditor', "Whether focus is in a chat editor.") });
	export const hasPromptFile = new RawContextKey<boolean>('chatPromptFileAttached', false, { type: 'boolean', description: localize('chatPromptFileAttachedContextDescription', "True when the chat has a prompt file attached.") });
	export const chatModeKind = new RawContextKey<ChatModeKind>('chatMode', ChatModeKind.Ask, { type: 'string', description: localize('chatMode', "The 'kind' of the current chat mode- Agent for custom modes.") });
	export const chatToolCount = new RawContextKey<number>('chatToolCount', 0, { type: 'number', description: localize('chatToolCount', "The number of tools available in the current chat mode.") });
	export const chatToolGroupingThreshold = new RawContextKey<number>('chat.toolGroupingThreshold', 0, { type: 'number', description: localize('chatToolGroupingThreshold', "The number of tools at which we start doing virtual grouping.") });

	export const supported = ContextKeyExpr.or(IsWebContext.negate(), RemoteNameContext.notEqualsTo(''), ContextKeyExpr.has('config.chat.experimental.serverlessWebEnabled'));
	export const enabled = new RawContextKey<boolean>('chatIsEnabled', false, { type: 'boolean', description: localize('chatIsEnabled', "True when chat is enabled because a default chat participant is activated with an implementation.") });

	/**
	 * True when the chat widget is locked to the coding agent session.
	 */
	export const lockedToCodingAgent = new RawContextKey<boolean>('lockedToCodingAgent', false, { type: 'boolean', description: localize('lockedToCodingAgent', "True when the chat widget is locked to the coding agent session.") });

	export const extensionParticipantRegistered = new RawContextKey<boolean>('chatPanelExtensionParticipantRegistered', false, { type: 'boolean', description: localize('chatPanelExtensionParticipantRegistered', "True when a default chat participant is registered for the panel from an extension.") });
	export const panelParticipantRegistered = new RawContextKey<boolean>('chatPanelParticipantRegistered', false, { type: 'boolean', description: localize('chatParticipantRegistered', "True when a default chat participant is registered for the panel.") });
	export const chatEditingCanUndo = new RawContextKey<boolean>('chatEditingCanUndo', false, { type: 'boolean', description: localize('chatEditingCanUndo', "True when it is possible to undo an interaction in the editing panel.") });
	export const chatEditingCanRedo = new RawContextKey<boolean>('chatEditingCanRedo', false, { type: 'boolean', description: localize('chatEditingCanRedo', "True when it is possible to redo an interaction in the editing panel.") });
	export const languageModelsAreUserSelectable = new RawContextKey<boolean>('chatModelsAreUserSelectable', false, { type: 'boolean', description: localize('chatModelsAreUserSelectable', "True when the chat model can be selected manually by the user.") });
	export const extensionInvalid = new RawContextKey<boolean>('chatExtensionInvalid', false, { type: 'boolean', description: localize('chatExtensionInvalid', "True when the installed chat extension is invalid and needs to be updated.") });
	export const inputCursorAtTop = new RawContextKey<boolean>('chatCursorAtTop', false);
	export const inputHasAgent = new RawContextKey<boolean>('chatInputHasAgent', false);
	export const location = new RawContextKey<ChatAgentLocation>('chatLocation', undefined);
	export const inQuickChat = new RawContextKey<boolean>('quickChatHasFocus', false, { type: 'boolean', description: localize('inQuickChat', "True when the quick chat UI has focus, false otherwise.") });
	export const hasFileAttachments = new RawContextKey<boolean>('chatHasFileAttachments', false, { type: 'boolean', description: localize('chatHasFileAttachments', "True when the chat has file attachments.") });

	export const remoteJobCreating = new RawContextKey<boolean>('chatRemoteJobCreating', false, { type: 'boolean', description: localize('chatRemoteJobCreating', "True when a remote coding agent job is being created.") });
	export const hasRemoteCodingAgent = new RawContextKey<boolean>('hasRemoteCodingAgent', false, localize('hasRemoteCodingAgent', "Whether any remote coding agent is available"));
	export const enableRemoteCodingAgentPromptFileOverlay = new RawContextKey<boolean>('enableRemoteCodingAgentPromptFileOverlay', false, localize('enableRemoteCodingAgentPromptFileOverlay', "Whether the remote coding agent prompt file overlay feature is enabled"));
	/** Used by the extension to skip the quit confirmation when #new wants to open a new folder */
	export const skipChatRequestInProgressMessage = new RawContextKey<boolean>('chatSkipRequestInProgressMessage', false, { type: 'boolean', description: localize('chatSkipRequestInProgressMessage', "True when the chat request in progress message should be skipped.") });

	export const Setup = {
		hidden: new RawContextKey<boolean>('chatSetupHidden', false, true), 		// True when chat setup is explicitly hidden.
		installed: new RawContextKey<boolean>('chatSetupInstalled', false, true),  	// True when the chat extension is installed and enabled.
		disabled: new RawContextKey<boolean>('chatSetupDisabled', false, true),  	// True when the chat extension is disabled due to any other reason than workspace trust.
		untrusted: new RawContextKey<boolean>('chatSetupUntrusted', false, true),  	// True when the chat extension is disabled due to workspace trust.
		later: new RawContextKey<boolean>('chatSetupLater', false, true)  			// True when the user wants to finish setup later.
	};

	export const Entitlement = {
		signedOut: new RawContextKey<boolean>('chatEntitlementSignedOut', false, true), 				// True when user is signed out.
		canSignUp: new RawContextKey<boolean>('chatPlanCanSignUp', false, true), 						// True when user can sign up to be a chat free user.

		planFree: new RawContextKey<boolean>('chatPlanFree', false, true),								// True when user is a chat free user.
		planPro: new RawContextKey<boolean>('chatPlanPro', false, true),								// True when user is a chat pro user.
		planProPlus: new RawContextKey<boolean>('chatPlanProPlus', false, true), 						// True when user is a chat pro plus user.
		planBusiness: new RawContextKey<boolean>('chatPlanBusiness', false, true), 						// True when user is a chat business user.
		planEnterprise: new RawContextKey<boolean>('chatPlanEnterprise', false, true), 					// True when user is a chat enterprise user.

		organisations: new RawContextKey<string[]>('chatEntitlementOrganisations', undefined, true), 	// The organizations the user belongs to.
		internal: new RawContextKey<boolean>('chatEntitlementInternal', false, true), 					// True when user belongs to internal organisation.
		sku: new RawContextKey<string>('chatEntitlementSku', undefined, true), 							// The SKU of the user.
	};

	export const chatQuotaExceeded = new RawContextKey<boolean>('chatQuotaExceeded', false, true);
	export const completionsQuotaExceeded = new RawContextKey<boolean>('completionsQuotaExceeded', false, true);

	export const Editing = {
		hasToolConfirmation: new RawContextKey<boolean>('chatHasToolConfirmation', false, { type: 'boolean', description: localize('chatEditingHasToolConfirmation', "True when a tool confirmation is present.") }),
	};

	export const Tools = {
		toolsCount: new RawContextKey<number>('toolsCount', 0, { type: 'number', description: localize('toolsCount', "The count of tools available in the chat.") })
	};

	export const Modes = {
		hasCustomChatModes: new RawContextKey<boolean>('chatHasCustomChatModes', false, { type: 'boolean', description: localize('chatHasCustomChatModes', "True when the chat has custom chat modes available.") }),
	};

	export const panelLocation = new RawContextKey<ViewContainerLocation>('chatPanelLocation', undefined, { type: 'number', description: localize('chatPanelLocation', "The location of the chat panel.") });

	export const inEmptyStateWithHistoryEnabled = new RawContextKey<boolean>('chatInEmptyStateWithHistoryEnabled', false, { type: 'boolean', description: localize('chatInEmptyStateWithHistoryEnabled', "True when chat empty state history is enabled AND chat is in empty state.") });

	export const sessionType = new RawContextKey<string>('chatSessionType', '', { type: 'string', description: localize('chatSessionType', "The type of the current chat session item.") });
	export const isHistoryItem = new RawContextKey<boolean>('chatIsHistoryItem', false, { type: 'boolean', description: localize('chatIsHistoryItem', "True when the chat session item is from history.") });
}

export namespace ChatContextKeyExprs {
	export const inEditingMode = ContextKeyExpr.or(
		ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit),
		ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
	);
}
