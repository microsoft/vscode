/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ERDOS_HELP_VIEW_ID, IErdosHelpService } from './services/helpService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ErdosHelpCanNavigateBackwardContext, ErdosHelpCanNavigateForwardContext } from '../../../common/contextkeys.js';

const enum HelpCommandIdentifiers {
	NavigateBackward = 'workbench.action.erdosHelp.navigateBackward',
	NavigateForward = 'workbench.action.erdosHelp.navigateForward',
	ShowHome = 'workbench.action.erdosHelp.showHome',
	TopicHistorySelector = 'workbench.action.erdosHelp.topicHistorySelector',
	TopicSearch = 'workbench.action.erdosHelp.topicSearch',
}

const COMMAND_CATEGORY = localize('help.category', "Help");

const iconNavigateBack = registerIcon('erdos-help-navigate-back', Codicon.chevronLeft, localize('icon.back', "Navigate back"));
const iconNavigateForward = registerIcon('erdos-help-navigate-forward', Codicon.chevronRight, localize('icon.forward', "Navigate forward"));
const iconHome = registerIcon('erdos-help-home', Codicon.home, localize('icon.home', "Show help home"));

export function initializeHelpCommands() {
	const category: ILocalizedString = {
		value: COMMAND_CATEGORY,
		original: 'Help'
	};

	// Show Home
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: HelpCommandIdentifiers.ShowHome,
				title: {
					value: localize('command.showHome', "Show Help Home"),
					original: 'Show Help Home'
				},
				f1: true,
				category,
				icon: iconHome,
				menu: [
					{
						id: MenuId.ViewTitleLeft,
						when: ContextKeyExpr.equals('view', ERDOS_HELP_VIEW_ID),
						group: 'navigation',
						order: 1
					}
				]
			});
		}

		async run(accessor: any) {
			const helpService = accessor.get(IErdosHelpService);
			const viewsService = accessor.get(IViewsService);
			await viewsService.openView(ERDOS_HELP_VIEW_ID, true);
			helpService.showWelcomePage();
		}
	});

	// Navigate Backward
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: HelpCommandIdentifiers.NavigateBackward,
				title: {
					value: localize('command.navigateBackward', "Navigate Backward"),
					original: 'Navigate Backward'
				},
				f1: true,
				category,
				icon: iconNavigateBack,
				precondition: ErdosHelpCanNavigateBackwardContext,
				menu: [
					{
						id: MenuId.ViewTitleLeft,
						when: ContextKeyExpr.equals('view', ERDOS_HELP_VIEW_ID),
						group: 'navigation',
						order: 2
					}
				]
			});
		}

		async run(accessor: any) {
			const helpService = accessor.get(IErdosHelpService);
			const viewsService = accessor.get(IViewsService);
			await viewsService.openView(ERDOS_HELP_VIEW_ID, true);
			helpService.navigateBackward();
		}
	});

	// Navigate Forward
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: HelpCommandIdentifiers.NavigateForward,
				title: {
					value: localize('command.navigateForward', "Navigate Forward"),
					original: 'Navigate Forward'
				},
				f1: true,
				category,
				icon: iconNavigateForward,
				precondition: ErdosHelpCanNavigateForwardContext,
				menu: [
					{
						id: MenuId.ViewTitleLeft,
						when: ContextKeyExpr.equals('view', ERDOS_HELP_VIEW_ID),
						group: 'navigation',
						order: 3
					}
				]
			});
		}

		async run(accessor: any) {
			const helpService = accessor.get(IErdosHelpService);
			const viewsService = accessor.get(IViewsService);
			await viewsService.openView(ERDOS_HELP_VIEW_ID, true);
			helpService.navigateForward();
		}
	});

	// Topic History Selector (placeholder action for custom view item)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: HelpCommandIdentifiers.TopicHistorySelector,
				title: {
					value: localize('command.topicHistorySelector', "Topic History"),
					original: 'Topic History'
				},
				f1: false,
				menu: [
					{
						id: MenuId.ViewTitleLeft,
						when: ContextKeyExpr.equals('view', ERDOS_HELP_VIEW_ID),
						group: 'navigation',
						order: 4
					}
				]
			});
		}

		async run() {
			// This action is handled by the custom view item
		}
	});

	// Topic Search (placeholder action for custom view item)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: HelpCommandIdentifiers.TopicSearch,
				title: {
					value: localize('command.topicSearch', "Search Help Topics"),
					original: 'Search Help Topics'
				},
				f1: false,
				menu: [
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', ERDOS_HELP_VIEW_ID),
						group: 'navigation',
						order: 5
					}
				]
			});
		}

		async run() {
			// This action is handled by the custom view item
		}
	});
}
