/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ModelSelectionReason, RestoredModelReason } from '../../../../workbench/contrib/chat/common/modelSelection.js';
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
 * Derived from the reason alone, so there is one record of how a chat came by its model — the
 * conversation's intended selection — rather than a second copy kept in step with it. What must
 * survive the round trip is whether the model speaks for the conversation, and it does:
 * {@link restoreReasonForSource} maps every source back to a reason on the same side of that line.
 *
 * A user's own pick returns as `Restored` rather than `User` once it has been written and read
 * back. Both are the conversation's own, so nothing that reads provenance can tell them apart in a
 * way that changes an outcome; only the label is coarser.
 */
export function sourceForReason(reason: ModelSelectionReason | undefined): ChatModelSource {
	switch (reason) {
		case ModelSelectionReason.UserSelection:
			return ChatModelSource.User;
		// Chosen for this conversation, if not by the user directly.
		case ModelSelectionReason.ProgrammaticSelection:
		case ModelSelectionReason.RestoredChoice:
			return ChatModelSource.Restored;
		// Carried onto the conversation rather than chosen in it.
		case ModelSelectionReason.SessionRestore:
			return ChatModelSource.Inherited;
		// A configured default, a remembered preference, or the first available model: chosen for a
		// conversation that had not chosen for itself.
		default:
			return ChatModelSource.Automatic;
	}
}
