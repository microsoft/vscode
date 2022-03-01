/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITerminalPersistedHistory, TerminalPersistedHistory } from 'vs/workbench/contrib/terminal/common/history';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

function getConfig(limit: number) {
	return {
		terminal: {
			integrated: {
				shellIntegration: {
					history: limit
				}
			}
		}
	};
}

suite('TerminalPersistedHistory', () => {
	let history: ITerminalPersistedHistory<number>;
	let instantiationService: TestInstantiationService;
	let storageService: TestStorageService;
	let configurationService: TestConfigurationService;

	setup(() => {
		configurationService = new TestConfigurationService(getConfig(5));
		storageService = new TestStorageService();
		instantiationService = new TestInstantiationService();
		instantiationService.set(IConfigurationService, configurationService);
		instantiationService.set(IStorageService, storageService);

		history = instantiationService.createInstance(TerminalPersistedHistory, 'test');
	});

	test('should support adding items to the cache and respect LRU', () => {
		history.add('foo', 1);
		deepStrictEqual(Array.from(history.entries), [
			['foo', 1]
		]);
		history.add('bar', 2);
		deepStrictEqual(Array.from(history.entries), [
			['foo', 1],
			['bar', 2]
		]);
		history.add('foo', 1);
		deepStrictEqual(Array.from(history.entries), [
			['bar', 2],
			['foo', 1]
		]);
	});

	test('should support removing specific items', () => {
		history.add('1', 1);
		history.add('2', 2);
		history.add('3', 3);
		history.add('4', 4);
		history.add('5', 5);
		strictEqual(Array.from(history.entries).length, 5);
		history.add('6', 6);
		strictEqual(Array.from(history.entries).length, 5);
	});

	test('should limit the number of entries based on config', () => {
		history.add('1', 1);
		history.add('2', 2);
		history.add('3', 3);
		history.add('4', 4);
		history.add('5', 5);
		strictEqual(Array.from(history.entries).length, 5);
		history.add('6', 6);
		strictEqual(Array.from(history.entries).length, 5);
		configurationService.setUserConfiguration('terminal', getConfig(2).terminal);
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
		strictEqual(Array.from(history.entries).length, 2);
		history.add('7', 7);
		strictEqual(Array.from(history.entries).length, 2);
		configurationService.setUserConfiguration('terminal', getConfig(3).terminal);
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
		strictEqual(Array.from(history.entries).length, 2);
		history.add('8', 8);
		strictEqual(Array.from(history.entries).length, 3);
		history.add('9', 9);
		strictEqual(Array.from(history.entries).length, 3);
	});

	test('should reload from storage service after recreation', () => {
		history.add('1', 1);
		history.add('2', 2);
		history.add('3', 3);
		strictEqual(Array.from(history.entries).length, 3);
		const history2 = instantiationService.createInstance(TerminalPersistedHistory, 'test');
		strictEqual(Array.from(history2.entries).length, 3);
	});
});
