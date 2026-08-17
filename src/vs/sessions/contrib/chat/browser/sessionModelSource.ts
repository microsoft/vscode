/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ModelSelectionReason, RestoredModelReason } from '../../../../workbench/contrib/chat/common/modelSelection.js';
import { ChatModelSource } from '../../../services/sessions/common/session.js';

/**
 * Translates between a provider's account of where a chat's model came from ({@link ChatModelSource},
 * four answers) and how the shared controller records one ({@link RestoredModelReason}, two). Kept
 * in one place so the collapse from four to two happens once.
 */

/** A model the provider cannot account for counts as the chat's own, so `chat.defaultModel` cannot overwrite it. */
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
 * Where to record a controller decision as having come from. Derived from the reason so there is a
 * single source of truth. A user's pick reads back as `Restored`: both count as the conversation's
 * own, so no outcome changes, only the label.
 */
export function sourceForReason(reason: ModelSelectionReason | undefined): ChatModelSource {
	switch (reason) {
		case ModelSelectionReason.UserSelection:
			return ChatModelSource.User;
		case ModelSelectionReason.ProgrammaticSelection:
		case ModelSelectionReason.RestoredChoice:
			return ChatModelSource.Restored;
		case ModelSelectionReason.SessionRestore:
			return ChatModelSource.Inherited;
		default:
			return ChatModelSource.Automatic;
	}
}
