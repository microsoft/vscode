/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import code, { codeTunnelSubcommands, commonOptions, extensionManagementOptions, troubleshootingOptions, globalTunnelOptions, extTunnelSubcommand, codeTunnelOptions } from './code';


export const codeTunnelSpecOptions: Fig.Option[] = [
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
		name: '--log',
		description: 'Log level to use',
		isRepeatable: true,
		args: {
			name: 'log',
			isOptional: true,
			suggestions: [
				'trace',
				'debug',
				'info',
				'warn',
				'error',
				'critical',
				'off',
			],
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
	{
		name: '--verbose',
		description: 'Print verbose output (implies --wait)',
	},
	{
		name: '--disable-telemetry',
		description: 'Disable telemetry for the current command, even if it was previously accepted as part of the license prompt or specified in \'--telemetry-level\'',
	},
	{
		name: ['-h', '--help'],
		description: 'Print help',
	},
];

const codeTunnelCompletionSpec: Fig.Spec = {
	...code,
	name: 'code-tunnel',
	subcommands: [
		...codeTunnelSubcommands,
		extTunnelSubcommand
	],
	options: [
		...commonOptions,
		...extensionManagementOptions('code-tunnel'),
		...troubleshootingOptions('code-tunnel'),
		...globalTunnelOptions,
		...codeTunnelOptions,
	]
};

export default codeTunnelCompletionSpec;
