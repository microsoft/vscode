/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseSetupPy } from '../../common/parsers/setupPyParser.js';

suite('RoboAgent - setupPyParser', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts console_scripts from setup.py', () => {
		const setup = `
from setuptools import setup

package_name = 'demo_py_pkg'

setup(
    name=package_name,
    version='0.0.1',
    packages=[package_name],
    entry_points={
        'console_scripts': [
            'talker = demo_py_pkg.talker:main',
            'listener = demo_py_pkg.listener:main',
        ],
    },
)
`;
		const result = parseSetupPy(setup);
		assert.strictEqual(result.consoleScripts.length, 2);
		assert.deepStrictEqual(result.consoleScripts[0], { executable: 'talker', target: 'demo_py_pkg.talker:main' });
		assert.deepStrictEqual(result.consoleScripts[1], { executable: 'listener', target: 'demo_py_pkg.listener:main' });
	});

	test('does not pull in unrelated key=value assignments', () => {
		const setup = `
setup(
    name='pkg',
    version='0.0.1',
    entry_points={
        'console_scripts': [
            'node_a = pkg.node_a:main',
        ],
    },
)
`;
		const result = parseSetupPy(setup);
		assert.strictEqual(result.consoleScripts.length, 1);
		assert.strictEqual(result.consoleScripts[0].executable, 'node_a');
	});

	test('extracts console_scripts from setup.cfg style', () => {
		const cfg = `
[options.entry_points]
console_scripts =
    talker = demo_py_pkg.talker:main
    listener = demo_py_pkg.listener:main
`;
		const result = parseSetupPy(cfg);
		const names = result.consoleScripts.map(s => s.executable).sort();
		assert.deepStrictEqual(names, ['listener', 'talker']);
	});

	test('returns empty list when no console_scripts', () => {
		const result = parseSetupPy(`setup(name='pkg', version='0.0.1')`);
		assert.deepStrictEqual(result.consoleScripts, []);
	});
});
