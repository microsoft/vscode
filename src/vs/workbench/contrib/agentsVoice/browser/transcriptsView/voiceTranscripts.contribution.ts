/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import {
	Extensions as ViewContainerExtensions,
	IViewContainersRegistry,
	IViewDescriptor,
	IViewsRegistry,
	ViewContainerLocation,
} from '../../../../common/views.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { VoiceTranscriptsViewPane } from './voiceTranscriptsView.js';

const CONTAINER_ID = 'workbench.view.voiceTranscriptsContainer';
const VIEW_ID = VoiceTranscriptsViewPane.ID;

const SHOW_VIEW_CONTEXT_KEY = new RawContextKey<boolean>('voiceTranscripts.showView', false);

const voiceTranscriptsIcon = registerIcon(
	'voice-transcripts-view-icon',
	Codicon.history,
	localize('voiceTranscriptsViewIcon', "View icon of the Voice Transcripts view."),
);

// --- Container ---

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

const container = viewContainersRegistry.registerViewContainer(
	{
		id: CONTAINER_ID,
		title: localize2('voiceTranscriptsContainer', "Voice Transcripts"),
		icon: voiceTranscriptsIcon,
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
		storageId: CONTAINER_ID,
		hideIfEmpty: true,
		order: 10,
	},
	ViewContainerLocation.Sidebar,
);

// --- View ---

const viewDescriptor: IViewDescriptor = {
	id: VIEW_ID,
	name: localize2('voiceTranscriptsView', "Voice Transcripts"),
	containerIcon: voiceTranscriptsIcon,
	ctorDescriptor: new SyncDescriptor(VoiceTranscriptsViewPane),
	canToggleVisibility: true,
	canMoveView: true,
	when: SHOW_VIEW_CONTEXT_KEY,
	openCommandActionDescriptor: {
		id: 'voiceTranscripts.focus',
		title: localize2('voiceTranscripts.focus', "Focus Voice Transcripts View"),
	},
};

viewsRegistry.registerViews([viewDescriptor], container);

// --- Show action (toggles the context key so the view appears in the activity bar, then focuses it) ---

const SHOW_VIEW_COMMAND_ID = 'agentsVoice.showTranscripts';

class ShowVoiceTranscriptsAction extends Action2 {
	constructor() {
		super({
			id: SHOW_VIEW_COMMAND_ID,
			title: localize2('agentsVoice.showTranscripts', "Show Voice Transcripts"),
			f1: true,
			category: localize2('agentsVoiceCategory', "Agents Voice"),
			precondition: ChatContextKeys.enabled,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const contextKeyService = accessor.get(IContextKeyService);
		const viewsService = accessor.get(IViewsService);
		SHOW_VIEW_CONTEXT_KEY.bindTo(contextKeyService).set(true);
		await viewsService.openView(VIEW_ID, true);
	}
}

registerAction2(ShowVoiceTranscriptsAction);

// --- View-title actions (Refresh / Archive All / Delete All) shown as ---
// --- inline icons in the view's title bar, and in the view's ⋯ menu.    ---

const VIEW_TITLE_WHEN = ContextKeyExpr.equals('view', VIEW_ID);

class RefreshVoiceTranscriptsAction extends Action2 {
	static readonly ID = 'voiceTranscripts.refresh';
	constructor() {
		super({
			id: RefreshVoiceTranscriptsAction.ID,
			title: localize2('voiceTranscripts.refresh', "Refresh"),
			icon: Codicon.refresh,
			menu: [{
				id: MenuId.ViewTitle,
				when: VIEW_TITLE_WHEN,
				group: 'navigation',
				order: 1,
			}],
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getActiveViewWithId<VoiceTranscriptsViewPane>(VIEW_ID);
		await view?.refresh();
	}
}

class ArchiveAllVoiceTranscriptsAction extends Action2 {
	static readonly ID = 'voiceTranscripts.archiveAll';
	constructor() {
		super({
			id: ArchiveAllVoiceTranscriptsAction.ID,
			title: localize2('voiceTranscripts.archiveAll', "Archive All"),
			icon: Codicon.archive,
			menu: [{
				id: MenuId.ViewTitle,
				when: VIEW_TITLE_WHEN,
				group: '1_actions',
				order: 1,
			}],
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getActiveViewWithId<VoiceTranscriptsViewPane>(VIEW_ID);
		await view?.archiveAll();
	}
}

class DeleteAllVoiceTranscriptsAction extends Action2 {
	static readonly ID = 'voiceTranscripts.deleteAll';
	constructor() {
		super({
			id: DeleteAllVoiceTranscriptsAction.ID,
			title: localize2('voiceTranscripts.deleteAll', "Delete All"),
			icon: Codicon.trash,
			menu: [{
				id: MenuId.ViewTitle,
				when: VIEW_TITLE_WHEN,
				group: '1_actions',
				order: 2,
			}],
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const dialogService = accessor.get(IDialogService);
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getActiveViewWithId<VoiceTranscriptsViewPane>(VIEW_ID);
		if (!view) {
			return;
		}
		const result = await dialogService.confirm({
			type: 'warning',
			message: localize('voiceTranscripts.deleteAllConfirm', "Delete all voice transcripts?"),
			detail: localize(
				'voiceTranscripts.deleteAllDetail',
				"This permanently deletes the local transcript file for your user. There is no server-side copy."
			),
			primaryButton: localize('voiceTranscripts.deleteAllConfirmButton', "Delete"),
		});
		if (result.confirmed) {
			await view.deleteAll();
		}
	}
}

registerAction2(RefreshVoiceTranscriptsAction);
registerAction2(ArchiveAllVoiceTranscriptsAction);
registerAction2(DeleteAllVoiceTranscriptsAction);

// --- Surface the action in the Chat view's ⋯ overflow menu, right alongside ---
// --- "Show Chat Debug View" (contributed by extensions/copilot/package.json    ---
// --- under view/title with when: view == workbench.panel.chat.view.copilot)    ---

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	command: {
		id: SHOW_VIEW_COMMAND_ID,
		title: localize('agentsVoice.showTranscripts.menu', "Show Voice Transcripts"),
	},
	when: ContextKeyExpr.equals('view', 'workbench.panel.chat.view.copilot'),
	group: '3_show',
	order: 2,
});

// --- Workbench contribution placeholder ---
// We don't have lifecycle work yet but reserving a contribution slot makes it
// easy to add e.g. an autorun that refreshes the view when the underlying store
// changes (future enhancement).

class VoiceTranscriptsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.voiceTranscripts';
	constructor() {
		super();
	}
}

registerWorkbenchContribution2(VoiceTranscriptsContribution.ID, VoiceTranscriptsContribution, WorkbenchPhase.AfterRestored);
