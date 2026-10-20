/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { autorun } from '../../../../../base/common/observable.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../../../../editor/common/config/editorConfigurationSchema.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import {
	defaultMultiDiffEditorExperimentalVariant,
	getWorkbenchMultiDiffEditorVariant,
	multiDiffEditorExperimentalFileListSetting,
	multiDiffEditorExperimentalVariantSetting,
	observableMultiDiffEditorFileListViewMode,
	observableMultiDiffEditorFileListPosition,
	observableMultiDiffEditorFileListVisible,
	observableWorkbenchMultiDiffEditorVariant,
	setMultiDiffEditorFileListViewMode,
	setMultiDiffEditorFileListPosition,
	toggleMultiDiffEditorFileList,
} from '../../common/multiDiffEditor.js';

// Capture registration before configuration-registry tests clear the shared registry.
const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
const registeredVariantSetting = configurationProperties[multiDiffEditorExperimentalVariantSetting];
const registeredFileListSetting = configurationProperties[multiDiffEditorExperimentalFileListSetting];
const registeredLineNumberSetting = configurationProperties['diffEditor.hideOriginalLineNumbers'];

suite('MultiDiffEditorConfiguration', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers the experimental variant setting', () => {
		const property = registeredVariantSetting;

		assert.deepStrictEqual({
			type: property.type,
			enum: property.enum,
			enumDescriptions: property.enumDescriptions,
			default: property.default,
			scope: property.scope,
			isExperimental: property.tags?.includes('experimental'),
			experiment: property.experiment,
		}, {
			type: 'string',
			enum: ['cards', 'noCards'],
			enumDescriptions: [
				'Use the compact card-based variant.',
				'Use the compact variant without cards.',
			],
			default: 'noCards',
			scope: ConfigurationScope.WINDOW,
			isExperimental: true,
			experiment: { mode: 'auto' },
		});
		assert.strictEqual(defaultMultiDiffEditorExperimentalVariant, 'noCards');
	});

	test('registers the experimental file list setting as opt-in', () => {
		const property = registeredFileListSetting;

		assert.deepStrictEqual({
			type: property.type,
			default: property.default,
			scope: property.scope,
			isExperimental: property.tags?.includes('experimental'),
		}, {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.WINDOW,
			isExperimental: true,
		});
	});

	test('registers original line number visibility as an inheritable setting', () => {
		const property = registeredLineNumberSetting;

		assert.deepStrictEqual({
			type: property.type,
			default: property.default,
			scope: property.scope,
			policy: property.policy,
		}, {
			type: ['boolean', 'null'],
			default: null,
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
			policy: undefined,
		});
	});

	test('maps setting values to compact variants', () => {
		assert.deepStrictEqual({
			cards: getWorkbenchMultiDiffEditorVariant('cards'),
			noCards: getWorkbenchMultiDiffEditorVariant('noCards'),
		}, {
			cards: 'cards',
			noCards: 'noCards',
		});
	});

	test('updates the resolved variant when configuration changes', async () => {
		const configurationService = new TestConfigurationService({
			[multiDiffEditorExperimentalVariantSetting]: 'cards',
		});
		const variant = observableWorkbenchMultiDiffEditorVariant(disposables, configurationService);
		const values: string[] = [];
		disposables.add(autorun(reader => values.push(variant.read(reader))));

		await configurationService.setUserConfiguration(multiDiffEditorExperimentalVariantSetting, 'noCards');
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(configuration: string): boolean {
				return configuration === multiDiffEditorExperimentalVariantSetting;
			}
		}());

		assert.deepStrictEqual(values, ['cards', 'noCards']);
	});

	test('shows the file list while the setting is on and the shared toggle has not hidden it', async () => {
		const configurationService = new TestConfigurationService({
			[multiDiffEditorExperimentalFileListSetting]: true,
		});
		const storageService = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new DisposableStore());
		const firstEditor = observableMultiDiffEditorFileListVisible(store, configurationService, storageService, store);
		const secondEditor = observableMultiDiffEditorFileListVisible(store, configurationService, storageService, store);
		const values = { firstEditor: [] as boolean[], secondEditor: [] as boolean[] };
		disposables.add(autorun(reader => values.firstEditor.push(firstEditor.read(reader))));
		disposables.add(autorun(reader => values.secondEditor.push(secondEditor.read(reader))));

		toggleMultiDiffEditorFileList(storageService);
		toggleMultiDiffEditorFileList(storageService);
		await configurationService.setUserConfiguration(multiDiffEditorExperimentalFileListSetting, false);
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(configuration: string): boolean {
				return configuration === multiDiffEditorExperimentalFileListSetting;
			}
		}());
		toggleMultiDiffEditorFileList(storageService);
		toggleMultiDiffEditorFileList(storageService);

		assert.deepStrictEqual(values, {
			firstEditor: [true, false, true, false],
			secondEditor: [true, false, true, false],
		});
	});

	test('shares the file list view mode between editors and defaults to a list', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new DisposableStore());
		const firstEditor = observableMultiDiffEditorFileListViewMode(store, storageService, store);
		const secondEditor = observableMultiDiffEditorFileListViewMode(store, storageService, store);
		const values = { firstEditor: [] as string[], secondEditor: [] as string[] };
		disposables.add(autorun(reader => values.firstEditor.push(firstEditor.read(reader))));
		disposables.add(autorun(reader => values.secondEditor.push(secondEditor.read(reader))));

		setMultiDiffEditorFileListViewMode(storageService, 'tree');
		setMultiDiffEditorFileListViewMode(storageService, 'tree');
		setMultiDiffEditorFileListViewMode(storageService, 'list');

		assert.deepStrictEqual(values, {
			firstEditor: ['list', 'tree', 'list'],
			secondEditor: ['list', 'tree', 'list'],
		});
	});

	test('shares and remembers the file list position, defaulting to the right', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new DisposableStore());
		const firstEditor = observableMultiDiffEditorFileListPosition(store, storageService, store);
		const secondEditor = observableMultiDiffEditorFileListPosition(store, storageService, store);
		const values = { firstEditor: [] as string[], secondEditor: [] as string[] };
		disposables.add(autorun(reader => values.firstEditor.push(firstEditor.read(reader))));
		disposables.add(autorun(reader => values.secondEditor.push(secondEditor.read(reader))));

		setMultiDiffEditorFileListPosition(storageService, 'left');
		setMultiDiffEditorFileListPosition(storageService, 'left');
		const restored = observableMultiDiffEditorFileListPosition(store, storageService, store).get();
		setMultiDiffEditorFileListPosition(storageService, 'right');

		assert.deepStrictEqual({ values, restored }, {
			values: {
				firstEditor: ['right', 'left', 'right'],
				secondEditor: ['right', 'left', 'right'],
			},
			restored: 'left',
		});
	});
});
