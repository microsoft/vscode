/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from '../../notebook/common/notebookContextKeys.js';
import { ERDOS_NOTEBOOK_CONSOLE_MIRRORING_KEY, ERDOS_NOTEBOOK_PLOT_MIRRORING_KEY } from './erdosNotebookExperimentalConfig.js';

const NOTEBOOK_ACTIONS_CATEGORY = localize2('notebookActions.category', "Notebook");

/**
 * Action to toggle the console mirroring display for notebooks.
 * Notebooks always share the same kernel session as the console.
 * When enabled, notebook code execution and outputs are also displayed in the console.
 * When disabled, notebook code execution and outputs are only shown in the notebook, not in the console.
 */
class ToggleNotebookConsoleMirroringAction extends Action2 {
	static readonly ID = 'erdosNotebook.toggleConsoleMirroring';

	constructor() {
		super({
			id: ToggleNotebookConsoleMirroringAction.ID,
			title: localize2('erdosNotebook.toggleConsoleMirroring', 'Toggle Console Mirroring'),
			icon: Codicon.link,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true,
			toggled: {
				condition: ContextKeyExpr.equals(`config.${ERDOS_NOTEBOOK_CONSOLE_MIRRORING_KEY}`, true),
				title: localize('erdosNotebook.consoleMirroringEnabled', 'Console Mirroring Enabled'),
				tooltip: localize('erdosNotebook.consoleMirroringEnabled.tooltip', 'Notebook code and outputs are displayed in the console')
			},
			tooltip: localize('erdosNotebook.consoleMirroringDisabled.tooltip', 'Notebook code and outputs are not displayed in the console'),
			menu: [
				{
					id: MenuId.NotebookEditorLayoutConfigure,
					group: 'notebookLayoutDetails',
					order: 4,
					when: NOTEBOOK_IS_ACTIVE_EDITOR,
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const currentValue = configurationService.getValue<boolean>(ERDOS_NOTEBOOK_CONSOLE_MIRRORING_KEY) ?? false;
		const newValue = !currentValue;		
		await configurationService.updateValue(ERDOS_NOTEBOOK_CONSOLE_MIRRORING_KEY, newValue);
	}
}

/**
 * Action to toggle the plot mirroring for notebooks.
 * When enabled, plots generated in notebook cells are displayed in both the notebook and the Plots pane.
 * When disabled, plots are only shown in the notebook cells.
 */
class ToggleNotebookPlotMirroringAction extends Action2 {
	static readonly ID = 'erdosNotebook.togglePlotMirroring';

	constructor() {
		super({
			id: ToggleNotebookPlotMirroringAction.ID,
			title: localize2('erdosNotebook.togglePlotMirroring', 'Toggle Plot Mirroring'),
			icon: Codicon.graph,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true,
			toggled: {
				condition: ContextKeyExpr.equals(`config.${ERDOS_NOTEBOOK_PLOT_MIRRORING_KEY}`, true),
				title: localize('erdosNotebook.plotMirroringEnabled', 'Plot Mirroring Enabled'),
				tooltip: localize('erdosNotebook.plotMirroringEnabled.tooltip', 'Notebook plots are displayed in the Plots pane')
			},
			tooltip: localize('erdosNotebook.plotMirroringDisabled.tooltip', 'Notebook plots are not displayed in the Plots pane'),
			menu: [
				{
					id: MenuId.NotebookEditorLayoutConfigure,
					group: 'notebookLayoutDetails',
					order: 5,
					when: NOTEBOOK_IS_ACTIVE_EDITOR,
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const currentValue = configurationService.getValue<boolean>(ERDOS_NOTEBOOK_PLOT_MIRRORING_KEY) ?? true;
		const newValue = !currentValue;		
		await configurationService.updateValue(ERDOS_NOTEBOOK_PLOT_MIRRORING_KEY, newValue);
	}
}

/**
 * Registers all erdos notebook actions.
 */
export function registerErdosNotebookActions(): void {
	registerAction2(ToggleNotebookConsoleMirroringAction);
	registerAction2(ToggleNotebookPlotMirroringAction);
}
