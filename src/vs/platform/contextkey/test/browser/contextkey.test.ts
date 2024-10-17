/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ContextKeyService, setContext } from '../../browser/contextKeyService.js';
import { ContextKeyExpr, IContextKeyService } from '../../common/contextkey.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';

suite('ContextKeyService', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('updateParent', () => {
		const root = testDisposables.add(new ContextKeyService(new TestConfigurationService()));
		const parent1 = testDisposables.add(root.createScoped(document.createElement('div')));
		const parent2 = testDisposables.add(root.createScoped(document.createElement('div')));

		const child = testDisposables.add(parent1.createScoped(document.createElement('div')));
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
		testDisposables.add(child.onDidChangeContext(e => {
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
		}));

		child.updateParent(parent2);

		return p;
	});

	test('updateParent to same service', () => {
		const root = testDisposables.add(new ContextKeyService(new TestConfigurationService()));
		const parent1 = testDisposables.add(root.createScoped(document.createElement('div')));

		const child = testDisposables.add(parent1.createScoped(document.createElement('div')));
		parent1.createKey('testA', 1);
		parent1.createKey('testB', 2);
		parent1.createKey('testD', 0);

		let eventFired = false;
		testDisposables.add(child.onDidChangeContext(e => {
			eventFired = true;
		}));

		child.updateParent(parent1);

		assert.strictEqual(eventFired, false);
	});

	test('issue #147732: URIs as context values', () => {
		const configurationService: IConfigurationService = new TestConfigurationService();
		const contextKeyService: IContextKeyService = testDisposables.add(new ContextKeyService(configurationService));
		const instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection(
			[IConfigurationService, configurationService],
			[IContextKeyService, contextKeyService],
			[ITelemetryService, new class extends mock<ITelemetryService>() {
				override async publicLog2() {
					//
				}
			}]
		)));

		const uri = URI.parse('test://abc');
		contextKeyService.createKey<string>('notebookCellResource', undefined).set(uri.toString());
		instantiationService.invokeFunction(setContext, 'jupyter.runByLineCells', JSON.parse(JSON.stringify([uri])));

		const expr = ContextKeyExpr.in('notebookCellResource', 'jupyter.runByLineCells');
		assert.deepStrictEqual(contextKeyService.contextMatchesRules(expr), true);
	});

	test('suppress update event from parent when one key is overridden by child', () => {
		const root = testDisposables.add(new ContextKeyService(new TestConfigurationService()));
		const child = testDisposables.add(root.createScoped(document.createElement('div')));

		root.createKey('testA', 1);
		child.createKey('testA', 4);

		let fired = false;
		const event = testDisposables.add(child.onDidChangeContext(e => fired = true));
		root.setContext('testA', 10);
		assert.strictEqual(fired, false, 'Should not fire event when overridden key is updated in parent');
		event.dispose();
	});

	test('suppress update event from parent when all keys are overridden by child', () => {
		const root = testDisposables.add(new ContextKeyService(new TestConfigurationService()));
		const child = testDisposables.add(root.createScoped(document.createElement('div')));

		root.createKey('testA', 1);
		root.createKey('testB', 2);
		root.createKey('testC', 3);

		child.createKey('testA', 4);
		child.createKey('testB', 5);
		child.createKey('testD', 6);

		let fired = false;
		const event = testDisposables.add(child.onDidChangeContext(e => fired = true));
		root.bufferChangeEvents(() => {
			root.setContext('testA', 10);
			root.setContext('testB', 20);
			root.setContext('testD', 30);
		});

		assert.strictEqual(fired, false, 'Should not fire event when overridden key is updated in parent');
		event.dispose();
	});

	test('pass through update event from parent when one key is not overridden by child', () => {
		const root = testDisposables.add(new ContextKeyService(new TestConfigurationService()));
		const child = testDisposables.add(root.createScoped(document.createElement('div')));

		root.createKey('testA', 1);
		root.createKey('testB', 2);
		root.createKey('testC', 3);

		child.createKey('testA', 4);
		child.createKey('testB', 5);
		child.createKey('testD', 6);

		const def = new DeferredPromise();
		testDisposables.add(child.onDidChangeContext(e => {
			try {
				assert.ok(e.affectsSome(new Set(['testA'])), 'testA changed');
				assert.ok(e.affectsSome(new Set(['testB'])), 'testB changed');
				assert.ok(e.affectsSome(new Set(['testC'])), 'testC changed');
			} catch (err) {
				def.error(err);
				return;
			}

			def.complete(undefined);
		}));

		root.bufferChangeEvents(() => {
			root.setContext('testA', 10);
			root.setContext('testB', 20);
			root.setContext('testC', 30);
		});

		return def.p;
	});
});
