/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
import { IFileDiffViewData, IMobileDiffViewData, MobileDiffView, MOBILE_OPEN_DIFF_VIEW_COMMAND_ID, openMobileDiffView } from '../../../../../sessions/browser/parts/mobile/contributions/mobileDiffView.js';
import { MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID, toRow, rowToDiffData } from '../../../../../sessions/browser/parts/mobile/contributions/mobileChangesView.js';
import { MobileMultiDiffView, IMobileMultiDiffViewData } from '../../../../../sessions/browser/parts/mobile/contributions/mobileMultiDiffView.js';
import { IsPhoneLayoutContext } from '../../../../../sessions/common/contextkeys.js';
import { localize, localize2 } from '../../../../../nls.js';

// Module-level slots for the active overlays so a re-invocation of the
// command (e.g. rapid double-tap) closes the prior overlay before opening
// a new one. The overlays self-dispose when the user taps "back" inside
// the view, and we listen to `onDidDispose` to clear the matching slot
// so `MutableDisposable.value === undefined` correctly tracks "no overlay
// open" — guarding against stale references after self-dispose.
const activeDiffView = new MutableDisposable<MobileDiffView>();
const activeMultiDiffView = new MutableDisposable<MobileMultiDiffView>();

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
		const textFileService = accessor.get(ITextFileService);
		const fileService = accessor.get(IFileService);
		const languageService = accessor.get(ILanguageService);
		const notificationService = accessor.get(INotificationService);
		const sessionsService = accessor.get(ISessionsService);

		const session = sessionsService.activeSession.get();
		const changes = session?.changes.get() ?? [];

		// Build per-file diff data, filtering out synthetic aggregate entries
		// (entries with no original/modified URIs can't be diffed).
		const rows = changes.map(c => toRow(c));
		const diffs: IFileDiffViewData[] = rows
			.map(r => rowToDiffData(r))
			.filter(d => d.originalURI || d.modifiedURI);

		if (diffs.length === 0) {
			notificationService.info(localize('mobileChangesNotAvailable', "File-level changes are not available for this session yet."));
			return;
		}

		// Single-file shortcut: bypass the multi-diff when only one change
		// exists — jump straight to the single-file diff view.
		if (diffs.length === 1) {
			const commandService = accessor.get(ICommandService);
			commandService.executeCommand(MOBILE_OPEN_DIFF_VIEW_COMMAND_ID, { diff: diffs[0] });
			return;
		}

		const data: IMobileMultiDiffViewData = { diffs };
		activeMultiDiffView.value = new MobileMultiDiffView(
			layoutService.mainContainer,
			data,
			textFileService,
			fileService,
			languageService,
		);
		const view = activeMultiDiffView.value;
		Event.once(view.onDidDispose)(() => {
			if (activeMultiDiffView.value === view) {
				activeMultiDiffView.clear();
			}
		});
	}
}

function isMobileDiffViewData(arg: IFileDiffViewData | IMobileDiffViewData): arg is IMobileDiffViewData {
	return arg && typeof arg === 'object' && 'diff' in arg;
}

registerAction2(MobileOpenDiffViewAction);
registerAction2(MobileOpenChangesViewAction);
