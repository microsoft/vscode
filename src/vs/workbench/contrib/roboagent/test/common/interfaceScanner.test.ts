/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { classifyInterfaceFile, classifyInterfaceFiles } from '../../common/parsers/interfaceScanner.js';

suite('RoboAgent - interfaceScanner', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies msg/srv/action files', () => {
		assert.deepStrictEqual(classifyInterfaceFile('Point32.msg'), { kind: 'msg', name: 'Point32', fileName: 'Point32.msg' });
		assert.deepStrictEqual(classifyInterfaceFile('AddTwoInts.srv'), { kind: 'srv', name: 'AddTwoInts', fileName: 'AddTwoInts.srv' });
		assert.deepStrictEqual(classifyInterfaceFile('Fibonacci.action'), { kind: 'action', name: 'Fibonacci', fileName: 'Fibonacci.action' });
	});

	test('ignores non-interface files', () => {
		assert.strictEqual(classifyInterfaceFile('README.md'), undefined);
		assert.strictEqual(classifyInterfaceFile('CMakeLists.txt'), undefined);
		assert.strictEqual(classifyInterfaceFile('noextension'), undefined);
	});

	test('classifies a list, dropping non-interfaces', () => {
		const result = classifyInterfaceFiles(['Twist.msg', 'notes.txt', 'Trigger.srv']);
		assert.strictEqual(result.length, 2);
		assert.deepStrictEqual(result.map(r => r.name), ['Twist', 'Trigger']);
	});
});
