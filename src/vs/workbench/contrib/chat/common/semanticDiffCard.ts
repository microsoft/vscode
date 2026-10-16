/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ISemanticDiffReport } from '../../../../platform/agentHost/common/semanticDiff.js';

/** Actions for one intent group, shown in the upper-right corner of its card. */
export const SemanticDiffCardMenu = new MenuId('ChatSemanticDiffCard');

/**
 * Opens the changes of one intent group in a multi-file diff editor. Invoked
 * from a card's change summary with an {@link ISemanticDiffCardActionContext}.
 */
export const OpenSemanticDiffGroupChangesCommandId = 'workbench.action.chat.openSemanticDiffGroupChanges';

/** View-owned identity, never model-authored navigation instructions. */
export interface ISemanticDiffCardSource {
	readonly sessionResource: URI;
	readonly responseId: string;
	readonly toolCallId: string;
}

/** Argument passed to {@link SemanticDiffCardMenu} actions. */
export interface ISemanticDiffCardActionContext extends ISemanticDiffCardSource {
	readonly groupId: string;
	readonly report: ISemanticDiffReport;
}
