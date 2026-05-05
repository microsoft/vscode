/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { IFileDiffViewData, MobileDiffView, MOBILE_OPEN_DIFF_VIEW_COMMAND_ID, openMobileDiffView } from '../../../../../sessions/browser/parts/mobile/contributions/mobileDiffView.js';
import { IsPhoneLayoutContext } from '../../../../../sessions/common/contextkeys.js';

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

	run(accessor: ServicesAccessor, diff: IFileDiffViewData): void {
		const layoutService = accessor.get(ILayoutService);
		const textFileService = accessor.get(ITextFileService);
		activeDiffView.value = openMobileDiffView(layoutService.mainContainer, { diff }, textFileService);
	}
}

registerAction2(MobileOpenDiffViewAction);
