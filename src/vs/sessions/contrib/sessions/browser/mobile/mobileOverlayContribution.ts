/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { IFileDiffViewData, IMobileDiffFeedbackHandler, IMobileDiffViewData, MobileDiffView, MOBILE_OPEN_DIFF_VIEW_COMMAND_ID, openMobileDiffView } from '../../../../../sessions/browser/parts/mobile/contributions/mobileDiffView.js';
import { IsPhoneLayoutContext } from '../../../../../sessions/common/contextkeys.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';

// Module-level slots for the active overlays so a re-invocation of the
// command (e.g. rapid double-tap) closes the prior overlay before opening
// a new one. The overlays self-dispose when the user taps "back" inside the
// view, which clears the corresponding slot.
const activeDiffView = new MutableDisposable<MobileDiffView>();
class MobileOpenDiffViewAction extends Action2 {
	constructor() {
		super({
			id: MOBILE_OPEN_DIFF_VIEW_COMMAND_ID,
			title: { value: 'Open File Diff', original: 'Open File Diff' },
			precondition: IsPhoneLayoutContext,
			f1: false,
		});
	}

	run(accessor: ServicesAccessor, arg: IFileDiffViewData | IMobileDiffViewData): void {
		const layoutService = accessor.get(ILayoutService);
		const textFileService = accessor.get(ITextFileService);
		const agentFeedbackService = accessor.get(IAgentFeedbackService);

		// Back-compat: callers may pass either the legacy `IFileDiffViewData`
		// directly or the richer `IMobileDiffViewData` envelope. Detect the
		// envelope shape by the presence of the `diff` property.
		const data: IMobileDiffViewData = isMobileDiffViewData(arg) ? arg : { diff: arg };
		const sessionResource = data.sessionResource;

		const feedbackHandler: IMobileDiffFeedbackHandler | undefined = sessionResource
			? createFeedbackHandler(agentFeedbackService)
			: undefined;

		activeDiffView.value = openMobileDiffView(layoutService.mainContainer, data, textFileService, feedbackHandler);
	}
}

function isMobileDiffViewData(value: IFileDiffViewData | IMobileDiffViewData): value is IMobileDiffViewData {
	return (value as IMobileDiffViewData).diff !== undefined;
}

/**
 * Bridge a {@link IMobileDiffFeedbackHandler} to the full
 * {@link IAgentFeedbackService}. The mobile diff view does not have a
 * Monaco cursor and so authors comments anchored to the whole file —
 * the range therefore spans line 1 through the agent feedback service's
 * sentinel "end of file" marker (a large endLineNumber, 1 column). The
 * service uses this only for sorting and the chat-input chip's "L1-N"
 * suffix; the desktop overlays that consume real ranges never run on
 * phone.
 */
function createFeedbackHandler(agentFeedbackService: IAgentFeedbackService): IMobileDiffFeedbackHandler {
	return {
		addFileFeedback(sessionResource: URI, resourceUri: URI, text: string, diffHunks: string | undefined): void {
			agentFeedbackService.addFeedback(
				sessionResource,
				resourceUri,
				{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				text,
				undefined,
				{ codeSelection: undefined, diffHunks },
			);
		},
	};
}

registerAction2(MobileOpenDiffViewAction);

