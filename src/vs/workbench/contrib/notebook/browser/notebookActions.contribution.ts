/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from '../common/notebookContextKeys.js';
import { NOTEBOOK_CONSOLE_MIRRORING_KEY, NOTEBOOK_PLOT_MIRRORING_KEY } from './notebookConfig.js';

const NOTEBOOK_ACTIONS_CATEGORY = localize2('notebookActions.category', "Notebook");

class ToggleNotebookConsoleMirroringAction extends Action2 {
	static readonly ID = 'notebook.toggleConsoleMirroring';

	constructor() {
		super({
			id: ToggleNotebookConsoleMirroringAction.ID,
			title: localize2('notebook.toggleConsoleMirroring', 'Toggle Console Mirroring'),
			icon: Codicon.link,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true,
			toggled: {
				condition: ContextKeyExpr.equals(`config.${NOTEBOOK_CONSOLE_MIRRORING_KEY}`, true),
				title: localize('notebook.consoleMirroringEnabled', 'Console Mirroring Enabled'),
				tooltip: localize('notebook.consoleMirroringEnabled.tooltip', 'Notebook code and outputs are displayed in the console')
			},
			tooltip: localize('notebook.consoleMirroringDisabled.tooltip', 'Notebook code and outputs are not displayed in the console'),
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
		const currentValue = configurationService.getValue<boolean>(NOTEBOOK_CONSOLE_MIRRORING_KEY) ?? false;
		const newValue = !currentValue;
		await configurationService.updateValue(NOTEBOOK_CONSOLE_MIRRORING_KEY, newValue);
	}
}

class ToggleNotebookPlotMirroringAction extends Action2 {
	static readonly ID = 'notebook.togglePlotMirroring';

	constructor() {
		super({
			id: ToggleNotebookPlotMirroringAction.ID,
			title: localize2('notebook.togglePlotMirroring', 'Toggle Plot Mirroring'),
			icon: Codicon.graph,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true,
			toggled: {
				condition: ContextKeyExpr.equals(`config.${NOTEBOOK_PLOT_MIRRORING_KEY}`, true),
				title: localize('notebook.plotMirroringEnabled', 'Plot Mirroring Enabled'),
				tooltip: localize('notebook.plotMirroringEnabled.tooltip', 'Notebook plots are displayed in the Plots pane')
			},
			tooltip: localize('notebook.plotMirroringDisabled.tooltip', 'Notebook plots are not displayed in the Plots pane'),
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
		const currentValue = configurationService.getValue<boolean>(NOTEBOOK_PLOT_MIRRORING_KEY) ?? true;
		const newValue = !currentValue;
		await configurationService.updateValue(NOTEBOOK_PLOT_MIRRORING_KEY, newValue);
	}
}

registerAction2(ToggleNotebookConsoleMirroringAction);
registerAction2(ToggleNotebookPlotMirroringAction);

