/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import * as assert from 'assert';

suite('ContextKeyService', () => {
	test('updateParent', () => {
		const root = new ContextKeyService(new TestConfigurationService());
		const parent1 = root.createScoped(document.createElement('div'));
		const parent2 = root.createScoped(document.createElement('div'));

		const child = parent1.createScoped(document.createElement('div'));
		parent1.createKey('testA', 1);
		parent1.createKey('testB', 2);
		parent1.createKey('testD', 0);

		parent2.createKey('testA', 3);
		parent2.createKey('testC', 4);
		parent2.createKey('testD', 0);

		let complete: () => void;
		let reject: (err: Error) => void;
		const p = new Promise<void>((_complete, _reject) => {
			complete = _complete;
			reject = _reject;
		});
		child.onDidChangeContext(e => {
			try {
				assert.ok(e.affectsSome(new Set(['testA'])), 'testA changed');
				assert.ok(e.affectsSome(new Set(['testB'])), 'testB changed');
				assert.ok(e.affectsSome(new Set(['testC'])), 'testC changed');
				assert.ok(!e.affectsSome(new Set(['testD'])), 'testD did not change');

				assert.equal(child.getContextKeyValue('testA'), 3);
				assert.equal(child.getContextKeyValue('testB'), undefined);
				assert.equal(child.getContextKeyValue('testC'), 4);
				assert.equal(child.getContextKeyValue('testD'), 0);
			} catch (err) {
				reject(err);
				return;
			}

			complete();
		});

		child.updateParent(parent2);

		return p;
	});
});
