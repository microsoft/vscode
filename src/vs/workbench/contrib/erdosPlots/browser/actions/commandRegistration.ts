/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ILocalizedString } from '../../../../../platform/action/common/action.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { ERDOS_PLOTS_VIEW_ID } from '../../common/erdosPlotsService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ErdosPlotsCountContext, ErdosPlotsSelectedPlotIdContext, ErdosPlotsCurrentIndexContext, ErdosPlotsIsLastPlotContext } from '../../../../common/contextkeys.js';
import { executePreviousPlotNavigation, executeNextPlotNavigation, executePlotSelectorAction, executeCurrentPlotCopy, executeCurrentPlotSave, executeCurrentPlotClear } from './commandImplementations.js';

const enum PlotCommandIdentifiers {
	NavigatePrevious = 'workbench.action.erdosPlots.navigatePreviousPlot',
	NavigateNext = 'workbench.action.erdosPlots.navigateNextPlot',
	SelectorWidget = 'workbench.action.erdosPlots.plotSelector',
	CopyToClipboard = 'workbench.action.erdosPlots.copyCurrentPlot',
	SaveToFile = 'workbench.action.erdosPlots.saveCurrentPlot',
	ClearCurrent = 'workbench.action.erdosPlots.clearCurrentPlot',
}

const COMMAND_CATEGORY = localize('plots.category', "Plots");

const iconNavigatePrevious = registerIcon('erdos-plots-navigate-previous', Codicon.chevronLeft, localize('icon.previous', "Previous plot"));
const iconNavigateNext = registerIcon('erdos-plots-navigate-next', Codicon.chevronRight, localize('icon.next', "Next plot"));
const iconCopyPlot = registerIcon('erdos-plots-copy', Codicon.copy, localize('icon.copy', "Copy plot"));
const iconSavePlot = registerIcon('erdos-plots-save', Codicon.save, localize('icon.save', "Save plot"));
const iconClearPlot = registerIcon('erdos-plots-clear', Codicon.trash, localize('icon.clear', "Clear current plot"));

/**
 * Register all plot-related commands and menu contributions.
 */
export function initializeCommandRegistry() {
	const category: ILocalizedString = {
		value: COMMAND_CATEGORY,
		original: 'Plots'
	};

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: PlotCommandIdentifiers.NavigatePrevious,
				title: {
					value: localize('command.navigatePrevious', "Previous Plot"),
					original: 'Previous Plot'
				},
				f1: true,
				category,
				icon: iconNavigatePrevious,
				precondition: ContextKeyExpr.greater(ErdosPlotsCurrentIndexContext.key, 0),
				menu: [
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(
							ContextKeyExpr.equals('view', ERDOS_PLOTS_VIEW_ID),
							ContextKeyExpr.greater(ErdosPlotsCountContext.key, 1)
						),
						group: 'navigation',
						order: 1
					}
				]
			});
		}

		async run(accessor: any) {
			await executePreviousPlotNavigation(accessor);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: PlotCommandIdentifiers.NavigateNext,
				title: {
					value: localize('command.navigateNext', "Next Plot"),
					original: 'Next Plot'
				},
				f1: true,
				category,
				icon: iconNavigateNext,
				precondition: ContextKeyExpr.not(ErdosPlotsIsLastPlotContext.key),
				menu: [
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(
							ContextKeyExpr.equals('view', ERDOS_PLOTS_VIEW_ID),
							ContextKeyExpr.greater(ErdosPlotsCountContext.key, 1)
						),
						group: 'navigation',
						order: 2
					}
				]
			});
		}

		async run(accessor: any) {
			await executeNextPlotNavigation(accessor);
		}
	});

	try {
		registerAction2(class PlotSelectorReactWidget extends Action2 {
			constructor() {
				const configuration = {
					id: PlotCommandIdentifiers.SelectorWidget,
					title: {
						value: localize('command.selectorWidget', "Select Plot"),
						original: 'Select Plot'
					},
					f1: false,
					menu: [
						{
							id: MenuId.ViewTitle,
							when: ContextKeyExpr.equals('view', ERDOS_PLOTS_VIEW_ID),
							group: 'navigation',
							order: 0
						}
					]
				};
				super(configuration);
			}

			async run(accessor: any) {
				await executePlotSelectorAction(accessor);
			}
		});
	} catch (error) {
		console.error('[CommandRegistration] ERROR registering selector widget:', error);
		throw error;
	}

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: PlotCommandIdentifiers.CopyToClipboard,
				title: {
					value: localize('command.copyPlot', "Copy Plot"),
					original: 'Copy Plot'
				},
				f1: true,
				category,
				icon: iconCopyPlot,
				menu: [
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(
							ContextKeyExpr.equals('view', ERDOS_PLOTS_VIEW_ID),
							ContextKeyExpr.notEquals(ErdosPlotsSelectedPlotIdContext.key, undefined)
						),
						group: 'navigation',
						order: 3
					}
				]
			});
		}

		async run(accessor: any) {
			await executeCurrentPlotCopy(accessor);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: PlotCommandIdentifiers.SaveToFile,
				title: {
					value: localize('command.savePlot', "Save Plot"),
					original: 'Save Plot'
				},
				f1: true,
				category,
				icon: iconSavePlot,
				menu: [
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(
							ContextKeyExpr.equals('view', ERDOS_PLOTS_VIEW_ID),
							ContextKeyExpr.notEquals(ErdosPlotsSelectedPlotIdContext.key, undefined)
						),
						group: 'navigation',
						order: 4
					}
				]
			});
		}

		async run(accessor: any) {
			await executeCurrentPlotSave(accessor);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: PlotCommandIdentifiers.ClearCurrent,
				title: {
					value: localize('command.clearPlot', "Clear Current Plot"),
					original: 'Clear Current Plot'
				},
				f1: true,
				category,
				icon: iconClearPlot,
				menu: [
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(
							ContextKeyExpr.equals('view', ERDOS_PLOTS_VIEW_ID),
							ContextKeyExpr.notEquals(ErdosPlotsSelectedPlotIdContext.key, undefined)
						),
						group: 'navigation',
						order: 5
					}
				]
			});
		}

		async run(accessor: any) {
			await executeCurrentPlotClear(accessor);
		}
	});
}

