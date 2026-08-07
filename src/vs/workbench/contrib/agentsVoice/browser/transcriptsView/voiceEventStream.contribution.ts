/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import {
	Extensions as ViewContainerExtensions,
	IViewContainersRegistry,
	IViewDescriptor,
	IViewsRegistry,
	ViewContainerLocation,
} from '../../../../common/views.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { VoiceEventStreamViewPane } from './voiceEventStreamView.js';

const CONTAINER_ID = 'workbench.view.voiceEventStreamContainer';
const VIEW_ID = VoiceEventStreamViewPane.ID;

const SHOW_VIEW_CONTEXT_KEY = new RawContextKey<boolean>('voiceEventStream.showView', true);

const voiceEventStreamIcon = registerIcon(
	'voice-event-stream-view-icon',
	Codicon.debug,
	localize('voiceEventStreamViewIcon', "View icon of the Voice Event Stream view."),
);

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

const container = viewContainersRegistry.registerViewContainer(
	{
		id: CONTAINER_ID,
		title: localize2('voiceEventStreamContainer', "Voice Event Stream"),
		icon: voiceEventStreamIcon,
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
		storageId: CONTAINER_ID,
		hideIfEmpty: true,
		order: 11,
	},
	ViewContainerLocation.Sidebar,
);

const viewDescriptor: IViewDescriptor = {
	id: VIEW_ID,
	name: localize2('voiceEventStreamView', "Voice Event Stream"),
	containerIcon: voiceEventStreamIcon,
	ctorDescriptor: new SyncDescriptor(VoiceEventStreamViewPane),
	canToggleVisibility: true,
	canMoveView: true,
	when: SHOW_VIEW_CONTEXT_KEY,
	openCommandActionDescriptor: {
		id: 'voiceEventStream.focus',
		title: localize2('voiceEventStream.focus', "Focus Voice Event Stream View"),
	},
};

viewsRegistry.registerViews([viewDescriptor], container);

const SHOW_VIEW_COMMAND_ID = 'agentsVoice.showEventStream';

class ShowVoiceEventStreamAction extends Action2 {
	constructor() {
		super({
			id: SHOW_VIEW_COMMAND_ID,
			title: localize2('agentsVoice.showEventStream', "Show Voice Event Stream"),
			f1: true,
			category: localize2('agentsVoiceCategory', "Agents Voice"),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const contextKeyService = accessor.get(IContextKeyService);
		const viewsService = accessor.get(IViewsService);
		SHOW_VIEW_CONTEXT_KEY.bindTo(contextKeyService).set(true);
		await viewsService.openView(VIEW_ID, true);
	}
}

registerAction2(ShowVoiceEventStreamAction);

const VIEW_TITLE_WHEN = ContextKeyExpr.equals('view', VIEW_ID);

class RefreshVoiceEventStreamAction extends Action2 {
	static readonly ID = 'voiceEventStream.refresh';
	constructor() {
		super({
			id: RefreshVoiceEventStreamAction.ID,
			title: localize2('voiceEventStream.refresh', "Refresh"),
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
		const view = viewsService.getActiveViewWithId<VoiceEventStreamViewPane>(VIEW_ID);
		await view?.refresh();
	}
}

class CopyVoiceEventStreamAction extends Action2 {
	static readonly ID = 'voiceEventStream.copy';
	constructor() {
		super({
			id: CopyVoiceEventStreamAction.ID,
			title: localize2('voiceEventStream.copy', "Copy Event Stream"),
			icon: Codicon.copy,
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
		const view = viewsService.getActiveViewWithId<VoiceEventStreamViewPane>(VIEW_ID);
		await view?.copyEventStream();
	}
}

registerAction2(RefreshVoiceEventStreamAction);
registerAction2(CopyVoiceEventStreamAction);

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	command: {
		id: SHOW_VIEW_COMMAND_ID,
		title: localize('agentsVoice.showEventStream.menu', "Show Voice Event Stream"),
	},
	when: ContextKeyExpr.equals('view', 'workbench.panel.chat.view.copilot'),
	group: '3_show',
	order: 3,
});
