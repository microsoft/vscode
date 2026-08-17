/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isInConversationModelChoice, isRestoredModelReason, ModelSelectionReason, RestoredModelReason } from '../../../../workbench/contrib/chat/common/modelSelection.js';
import { ChatModelSource } from '../../../services/sessions/common/session.js';

/**
 * Translation between how a provider accounts for a chat's model ({@link ChatModelSource}) and how
 * the shared selection controller records one ({@link RestoredModelReason}).
 *
 * The two vocabularies differ on purpose. A provider reports *what happened* to a chat, which the
 * Agents Window needs in its own right; the controller only needs to know whether the model speaks
 * for the conversation. Keeping the mapping in one place means the collapse from four answers to
 * two happens once.
 */

/**
 * How a model a chat is already on should be recorded.
 *
 * Only called for a chat that has a model. A provider that cannot account for one says so, and is
 * taken at its word that the model is the chat's own — the safe answer, because the alternative is
 * letting `chat.defaultModel` overwrite a model the user may well have picked. A chat with no model
 * at all never reaches here, because there is no authority to weigh.
 */
export function restoreReasonForSource(source: ChatModelSource | undefined): RestoredModelReason {
	switch (source) {
		case ChatModelSource.Automatic:
		case ChatModelSource.Inherited:
			return ModelSelectionReason.SessionRestore;
		default:
			return ModelSelectionReason.RestoredChoice;
	}
}

/**
 * The provenance to attribute a controller-driven write to.
 *
 * The controller applies a model for several reasons, and only some of them are the input choosing
 * on the conversation's behalf. Reclaiming the conversation's own model — or re-applying it under
 * the identifier its pool publishes it as — carries the authority the conversation already had, so
 * writing it back as {@link ChatModelSource.Automatic} would quietly demote a user's pick to
 * something `chat.defaultModel` may overwrite.
 *
 * @param authorityInForce The provenance the conversation is currently understood to have.
 */
export function sourceForControllerWrite(
	reason: ModelSelectionReason | undefined,
	authorityInForce: ChatModelSource | undefined,
): ChatModelSource {
	if (reason === ModelSelectionReason.UserSelection) {
		return ChatModelSource.User;
	}
	// Acting on the model the conversation already had, so its authority carries over.
	if (isInConversationModelChoice(reason) || isRestoredModelReason(reason)) {
		return authorityInForce ?? ChatModelSource.Restored;
	}
	// A configured default, a remembered preference, or the first available model: chosen for a
	// conversation that had not chosen for itself.
	return ChatModelSource.Automatic;
}
