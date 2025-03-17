/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import code, { commonOptions, extensionManagementOptions, troubleshootingOptions } from './code';

const codeTunnelCompletionSpec: Fig.Spec = {
	...code,
	name: 'code-tunnel',
	description: 'Create a tunnel that\'s accessible on vscode.dev from anywhere.',
	options: [
		...commonOptions,
		...extensionManagementOptions('code-tunnel'),
		...troubleshootingOptions('code-tunnel'),
		{
			name: '--cli-data-dir',
			description: 'Directory where CLI metadata should be stored',
			isRepeatable: true,
			args: {
				name: 'cli_data_dir',
				isOptional: true,
			},
		},
		{
			name: '--log-to-file',
			description: 'Log to a file in addition to stdout. Used when running as a service',
			hidden: true,
			isRepeatable: true,
			args: {
				name: 'log_to_file',
				isOptional: true,
				template: 'filepaths',
			},
		},

		{
			name: '--telemetry-level',
			description: 'Sets the initial telemetry level',
			hidden: true,
			isRepeatable: true,
			args: {
				name: 'telemetry_level',
				isOptional: true,
				suggestions: [
					'off',
					'crash',
					'error',
					'all',
				],
			},
		},
	]
};

export default codeTunnelCompletionSpec;
