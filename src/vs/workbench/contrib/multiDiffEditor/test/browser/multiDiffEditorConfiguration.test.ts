/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { autorun } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../../../../editor/common/config/editorConfigurationSchema.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import {
	defaultMultiDiffEditorExperimentalVariant,
	getWorkbenchMultiDiffEditorVariant,
	multiDiffEditorExperimentalVariantSetting,
	observableWorkbenchMultiDiffEditorVariant,
} from '../../common/multiDiffEditor.js';

suite('MultiDiffEditorConfiguration', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers the experimental variant setting', () => {
		const property = Registry.as<IConfigurationRegistry>(Extensions.Configuration)
			.getConfigurationProperties()[multiDiffEditorExperimentalVariantSetting];

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

	test('registers original line number visibility as an inheritable setting', () => {
		const property = Registry.as<IConfigurationRegistry>(Extensions.Configuration)
			.getConfigurationProperties()['diffEditor.hideOriginalLineNumbers'];

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
});
