/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
import { IFileDiffViewData, IMobileDiffViewData, MobileDiffView, MOBILE_OPEN_DIFF_VIEW_COMMAND_ID, openMobileDiffView } from '../../../../../sessions/browser/parts/mobile/contributions/mobileDiffView.js';
import { MobileChangesView, MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID, openMobileChangesView, toRow, rowToDiffData } from '../../../../../sessions/browser/parts/mobile/contributions/mobileChangesView.js';
import { IsPhoneLayoutContext } from '../../../../../sessions/common/contextkeys.js';
import { localize2 } from '../../../../../nls.js';

// Module-level slots for the active overlays so a re-invocation of the
// command (e.g. rapid double-tap) closes the prior overlay before opening
// a new one. The overlays self-dispose when the user taps "back" inside
// the view, and we listen to `onDidDispose` to clear the matching slot
// so `MutableDisposable.value === undefined` correctly tracks "no overlay
// open" — guarding against stale references after self-dispose.
const activeDiffView = new MutableDisposable<MobileDiffView>();
const activeChangesView = new MutableDisposable<MobileChangesView>();

class MobileOpenDiffViewAction extends Action2 {
	constructor() {
		super({
			id: MOBILE_OPEN_DIFF_VIEW_COMMAND_ID,
			title: localize2('mobileOpenFileDiff', 'Open File Diff'),
			precondition: IsPhoneLayoutContext,
			f1: false,
		});
	}

	run(accessor: ServicesAccessor, arg: IFileDiffViewData | IMobileDiffViewData): void {
		const layoutService = accessor.get(ILayoutService);
		const textFileService = accessor.get(ITextFileService);
		const languageService = accessor.get(ILanguageService);

		// Accept either the legacy single-file payload or the new
		// payload-with-siblings shape. The new shape's discriminator is
		// the presence of a `diff` field; the legacy shape *is* the diff.
		const data: IMobileDiffViewData = isMobileDiffViewData(arg)
			? arg
			: { diff: arg };

		activeDiffView.value = openMobileDiffView(layoutService.mainContainer, data, textFileService, languageService);
		// Clear the slot when the view tears itself down (back-button)
		// so the slot value tracks "no overlay open" correctly. The
		// equality guard ensures a newer view that has already replaced
		// `value` doesn't get stomped on by the prior view's
		// `onDidDispose` firing late.
		const view = activeDiffView.value;
		Event.once(view.onDidDispose)(() => {
			if (activeDiffView.value === view) {
				activeDiffView.clear();
			}
		});
	}
}

class MobileOpenChangesViewAction extends Action2 {
	constructor() {
		super({
			id: MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID,
			title: localize2('mobileOpenSessionChanges', 'Open Session Changes'),
			precondition: IsPhoneLayoutContext,
			f1: false,
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(ILayoutService);
		const instantiationService = accessor.get(IInstantiationService);
		const commandService = accessor.get(ICommandService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);

		// Single-file shortcut: bypass the list when only one change
		// exists — opening a list to show one row would be a useless tap.
		const session = sessionsManagementService.activeSession.get();
		const changes = session?.changes.get() ?? [];
		if (changes.length === 1) {
			const diff = rowToDiffData(toRow(changes[0]));
			commandService.executeCommand(MOBILE_OPEN_DIFF_VIEW_COMMAND_ID, { diff });
			return;
		}

		activeChangesView.value = openMobileChangesView(
			instantiationService,
			layoutService.mainContainer,
			(diff, siblings, index) => {
				// Routing through the command keeps the diff overlay
				// lifecycle (the `activeDiffView` slot) consistent with
				// every other entry point.
				commandService.executeCommand(MOBILE_OPEN_DIFF_VIEW_COMMAND_ID, { diff, siblings, index } satisfies IMobileDiffViewData);
			},
		);
		const view = activeChangesView.value;
		Event.once(view.onDidDispose)(() => {
			if (activeChangesView.value === view) {
				activeChangesView.clear();
			}
		});
	}
}

function isMobileDiffViewData(arg: IFileDiffViewData | IMobileDiffViewData): arg is IMobileDiffViewData {
	return arg && typeof arg === 'object' && 'diff' in arg;
}

registerAction2(MobileOpenDiffViewAction);
registerAction2(MobileOpenChangesViewAction);
