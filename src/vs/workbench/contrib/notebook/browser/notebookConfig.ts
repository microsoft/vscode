/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import {
	ConfigurationScope,
	Extensions,
	IConfigurationRegistry,
} from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

export const NOTEBOOK_CONSOLE_MIRRORING_KEY = 'notebook.consoleMirroring.enabled';
export const NOTEBOOK_PLOT_MIRRORING_KEY = 'notebook.plotMirroring.enabled';

const configurationRegistry = Registry.as<IConfigurationRegistry>(
	Extensions.Configuration
);
configurationRegistry.registerConfiguration({
	id: 'notebook',
	order: 7,
	title: localize('notebookConfigurationTitle', "Notebook"),
	type: 'object',
	scope: ConfigurationScope.MACHINE_OVERRIDABLE,
	properties: {
		[NOTEBOOK_CONSOLE_MIRRORING_KEY]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize(
				'notebook.consoleMirroring.enabled',
				'Controls whether notebook code execution and text outputs are displayed in the console. Notebooks always share the same kernel session as the console, allowing variables and state to be shared. When enabled, notebook activity is also shown in the console. When disabled, notebook activity is only shown in the notebook interface.'
			),
		},
		[NOTEBOOK_PLOT_MIRRORING_KEY]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize(
				'notebook.plotMirroring.enabled',
				'Controls whether plots generated in notebook cells are displayed in the Plots pane. When enabled, plots from notebooks appear in both the notebook cell output and the Plots pane. When disabled, plots only appear in the notebook cell output.'
			),
		},
	},
});

