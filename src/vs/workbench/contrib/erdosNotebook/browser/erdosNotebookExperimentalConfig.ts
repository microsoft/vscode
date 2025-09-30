/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import {
	ConfigurationScope,
	Extensions,
	IConfigurationRegistry,
} from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

// Configuration key for the Erdos notebook setting
export const ERDOS_NOTEBOOK_ENABLED_KEY = 'erdos.notebook.enabled';

// Configuration key for the console mirroring setting
export const ERDOS_NOTEBOOK_CONSOLE_MIRRORING_KEY = 'erdosNotebook.consoleMirroring.enabled';

// Configuration key for the plot mirroring setting
export const ERDOS_NOTEBOOK_PLOT_MIRRORING_KEY = 'erdosNotebook.plotMirroring.enabled';

/**
 * Retrieves the value of the configuration setting that determines whether to enable
 * the experimental Erdos Notebook editor.
 * @param configurationService The configuration service
 * @returns Whether to enable the experimental Erdos Notebook editor
 */
export function checkErdosNotebookEnabled(
	configurationService: IConfigurationService
): boolean {
	return Boolean(
		configurationService.getValue(ERDOS_NOTEBOOK_ENABLED_KEY)
	);
}

// Register the configuration setting
const configurationRegistry = Registry.as<IConfigurationRegistry>(
	Extensions.Configuration
);
configurationRegistry.registerConfiguration({
	id: 'erdos',
	order: 7,
	title: localize('erdosConfigurationTitle', "Erdos"),
	type: 'object',
	scope: ConfigurationScope.MACHINE_OVERRIDABLE,
	properties: {
		[ERDOS_NOTEBOOK_ENABLED_KEY]: {
			type: 'boolean',
			default: false,
			included: false, // Hide from Settings UI - can only be set directly in JSON
			tags: ['experimental'],
			markdownDescription: localize(
				'erdos.enableErdosNotebook',
				'Enable the Erdos Notebook editor for .ipynb files. When disabled, the default VS Code notebook editor will be used.\n\nA restart is required to take effect.'
			),
		},
		[ERDOS_NOTEBOOK_CONSOLE_MIRRORING_KEY]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize(
				'erdosNotebook.consoleMirroring.enabled',
				'Controls whether notebook code execution and text outputs are displayed in the console. Notebooks always share the same kernel session as the console, allowing variables and state to be shared. When enabled, notebook activity is also shown in the console. When disabled, notebook activity is only shown in the notebook interface.'
			),
		},
		[ERDOS_NOTEBOOK_PLOT_MIRRORING_KEY]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize(
				'erdosNotebook.plotMirroring.enabled',
				'Controls whether plots generated in notebook cells are displayed in the Plots pane. When enabled, plots from notebooks appear in both the notebook cell output and the Plots pane. When disabled, plots only appear in the notebook cell output.'
			),
		},
	},
});