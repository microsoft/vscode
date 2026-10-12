/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import 'mocha';
import cargoSpec from '../../../completions/upstream/cargo';

function getNames(items: readonly { name: string | string[] }[]): string[] {
	return items.flatMap(item => typeof item.name === 'string' ? [item.name] : item.name);
}

suite('Cargo completion spec', () => {
	test('includes the upstream command and build option surface', () => {
		const subcommands = (cargoSpec as Fig.Subcommand).subcommands;
		if (!Array.isArray(subcommands)) {
			throw new Error('Expected Cargo to define static subcommands');
		}

		const build = subcommands.find(command => getNames([command]).includes('build'));
		if (!build || !Array.isArray(build.options)) {
			throw new Error('Expected Cargo to define static build options');
		}

		const expected = {
			subcommands: [
				'bench', 'build', 'check', 'fix', 'generate-lockfile', 'install',
				'locate-project', 'login', 'logout', 'metadata', 'owner', 'package',
				'pkgid', 'run', 'rustc', 'rustdoc', 'search', 'test', 'tree',
				'uninstall', 'vendor', 'yank',
			],
			buildOptions: [
				'-j', '--jobs', '-p', '--package', '-q', '--quiet', '-r', '--release',
				'-v', '--verbose', '--all-features', '--bench', '--bin', '--example',
				'--features', '--frozen', '--lib', '--locked', '--manifest-path',
				'--no-default-features', '--offline', '--profile', '--target',
				'--target-dir', '--test', '--workspace',
			],
		};
		const subcommandNames = new Set(getNames(subcommands));
		const buildOptionNames = new Set(getNames(build.options));

		deepStrictEqual({
			subcommands: expected.subcommands.filter(name => subcommandNames.has(name)),
			buildOptions: expected.buildOptions.filter(name => buildOptionNames.has(name)),
		}, expected);
	});
});
