/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { DeferredPromise } from 'vs/base/common/async';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ContextKeyService, setContext } from 'vs/platform/contextkey/browser/contextKeyService';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';

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

				assert.strictEqual(child.getContextKeyValue('testA'), 3);
				assert.strictEqual(child.getContextKeyValue('testB'), undefined);
				assert.strictEqual(child.getContextKeyValue('testC'), 4);
				assert.strictEqual(child.getContextKeyValue('testD'), 0);
			} catch (err) {
				reject(err);
				return;
			}

			complete();
		});

		child.updateParent(parent2);

		return p;
	});

	test('issue #147732: URIs as context values', () => {
		const disposables = new DisposableStore();
		const configurationService: IConfigurationService = new TestConfigurationService();
		const contextKeyService: IContextKeyService = disposables.add(new ContextKeyService(configurationService));
		const instantiationService = new TestInstantiationService(new ServiceCollection(
			[IConfigurationService, configurationService],
			[IContextKeyService, contextKeyService]
		));

		const uri = URI.parse('test://abc');
		contextKeyService.createKey<string>('notebookCellResource', undefined).set(uri.toString());
		instantiationService.invokeFunction(setContext, 'jupyter.runByLineCells', JSON.parse(JSON.stringify([uri])));

		const expr = ContextKeyExpr.in('notebookCellResource', 'jupyter.runByLineCells');
		assert.deepStrictEqual(contextKeyService.contextMatchesRules(expr), true);
	});

	test('suppress update event from parent when one key is overridden by child', () => {
		const root = new ContextKeyService(new TestConfigurationService());
		const child = root.createScoped(document.createElement('div'));

		root.createKey('testA', 1);
		child.createKey('testA', 4);

		let fired = false;
		const event = child.onDidChangeContext(e => fired = true);
		root.setContext('testA', 10);
		assert.strictEqual(fired, false, 'Should not fire event when overridden key is updated in parent');
		event.dispose();
	});

	test('suppress update event from parent when all keys are overridden by child', () => {
		const root = new ContextKeyService(new TestConfigurationService());
		const child = root.createScoped(document.createElement('div'));

		root.createKey('testA', 1);
		root.createKey('testB', 2);
		root.createKey('testC', 3);

		child.createKey('testA', 4);
		child.createKey('testB', 5);
		child.createKey('testD', 6);

		let fired = false;
		const event = child.onDidChangeContext(e => fired = true);
		root.bufferChangeEvents(() => {
			root.setContext('testA', 10);
			root.setContext('testB', 20);
			root.setContext('testD', 30);
		});

		assert.strictEqual(fired, false, 'Should not fire event when overridden key is updated in parent');
		event.dispose();
	});

	test('pass through update event from parent when one key is not overridden by child', () => {
		const root = new ContextKeyService(new TestConfigurationService());
		const child = root.createScoped(document.createElement('div'));

		root.createKey('testA', 1);
		root.createKey('testB', 2);
		root.createKey('testC', 3);

		child.createKey('testA', 4);
		child.createKey('testB', 5);
		child.createKey('testD', 6);

		const def = new DeferredPromise();
		child.onDidChangeContext(e => {
			try {
				assert.ok(e.affectsSome(new Set(['testA'])), 'testA changed');
				assert.ok(e.affectsSome(new Set(['testB'])), 'testB changed');
				assert.ok(e.affectsSome(new Set(['testC'])), 'testC changed');
			} catch (err) {
				def.error(err);
				return;
			}

			def.complete(undefined);
		});

		root.bufferChangeEvents(() => {
			root.setContext('testA', 10);
			root.setContext('testB', 20);
			root.setContext('testC', 30);
		});

		return def.p;
	});
});
