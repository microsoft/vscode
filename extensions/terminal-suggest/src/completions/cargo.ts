/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cargoFeaturesGenerator: Fig.Generator = {
	script: ['cargo', 'read-manifest'],
	postProcess: (out) => {
		if (!out || out.trim() === '') {
			return [];
		}

		try {
			const manifest = JSON.parse(out);
			const features = manifest.features || {};

			return Object.keys(features).map((featureName) => {
				const dependencies = features[featureName];
				const desc = dependencies.length > 0
					? `Activates: ${dependencies.join(', ')}`
					: 'Cargo feature';

				return {
					name: featureName,
					description: desc,
					icon: 'fig://icon?type=cargo'
				};
			});
		} catch (e) {
			console.error('Failed to parse cargo manifest:', e);
			return [];
		}
	}
};

const cargoSpec: Fig.Spec = {
	name: 'cargo',
	description: 'Rust Package Manager',
	subcommands: [
		{ name: ['build', 'b'], description: 'Compile the current package' },
		{ name: ['run', 'r'], description: 'Run a binary or example of the local package' },
		{ name: ['test', 't'], description: 'Execute all unit and integration tests' },
		{ name: ['check', 'c'], description: 'Analyze the current package and report errors, but don\'t build object files' },
		{ name: 'clippy', description: 'Checks a package to catch common mistakes and improve your Rust code' },
		{ name: 'fmt', description: 'Formats all bin and lib files of the current crate using rustfmt' },
		{ name: 'add', description: 'Add dependencies to a Cargo.toml manifest file' },
		{ name: 'remove', description: 'Remove dependencies from a Cargo.toml manifest file' },
		{ name: 'clean', description: 'Remove the target directory' },
		{ name: ['doc', 'd'], description: 'Build a package\'s documentation' },
		{ name: 'publish', description: 'Upload a package to the registry' },
		{ name: 'update', description: 'Update dependencies as recorded in the local lock file' },
		{ name: 'new', description: 'Create a new cargo package' },
		{ name: 'init', description: 'Create a new cargo package in an existing directory' }
	],
	options: [
		{
			name: ['-F', '--features'],
			description: 'Space or comma separated list of features to activate',
			args: {
				name: 'FEATURES',
				generators: cargoFeaturesGenerator
			}
		},
		{ name: '--all-features', description: 'Activate all available features' },
		{ name: '--no-default-features', description: 'Do not activate the `default` feature' },
		{ name: ['-h', '--help'], description: 'Print help' },
		{ name: ['-V', '--version'], description: 'Print version' }
	]
};

export default cargoSpec;
