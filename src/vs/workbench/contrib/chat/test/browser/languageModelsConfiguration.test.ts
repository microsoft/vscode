/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Emitter } from '../../../../../base/common/event.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { ChatLanguageModelsDataContribution, parseLanguageModelsProviderGroups } from '../../browser/languageModelsConfigurationService.js';
import { ILanguageModelChatMetadata, ILanguageModelProviderDescriptor, ILanguageModelsService } from '../../common/languageModels.js';

suite('LanguageModelsConfiguration', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('parseLanguageModelsConfiguration - empty', () => {
		const model = testDisposables.add(createTextModel('[]'));
		const result = parseLanguageModelsProviderGroups(model);
		assert.deepStrictEqual(result, []);
	});

	test('parseLanguageModelsConfiguration - simple', () => {
		const content = JSON.stringify([{
			vendor: 'vendor',
			name: 'group',
			configurations: []
		}], null, '\t');
		const model = testDisposables.add(createTextModel(content));
		const result = parseLanguageModelsProviderGroups(model);

		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].name, 'group');
		assert.strictEqual(result[0].vendor, 'vendor');
		assert.ok(result[0].range);
	});

	test('parseLanguageModelsConfiguration - with configuration range', () => {
		const content = `[
	{
		"vendor": "vendor",
		"name": "group",
		"configurations": [
			{
				"configuration": {
					"foo": "bar"
				}
			}
		]
	}
]`;
		const model = testDisposables.add(createTextModel(content));
		const result = parseLanguageModelsProviderGroups(model);

		const configurations = result[0].configurations as { configuration: Record<string, unknown> }[];
		const config = configurations[0].configuration;
		assert.deepStrictEqual(config, { foo: 'bar' });
	});

	test('parseLanguageModelsConfiguration - multiple vendors and groups', () => {
		const content = `[
	{ "vendor": "vendor1", "name": "g1", "configurations": [] },
	{ "vendor": "vendor1", "name": "g2", "configurations": [] },
	{ "vendor": "vendor2", "name": "g3", "configurations": [] }
]`;
		const model = testDisposables.add(createTextModel(content));
		const result = parseLanguageModelsProviderGroups(model);

		assert.strictEqual(result.length, 3);
		assert.strictEqual(result[0].name, 'g1');
		assert.strictEqual(result[0].vendor, 'vendor1');
		assert.strictEqual(result[1].name, 'g2');
		assert.strictEqual(result[1].vendor, 'vendor1');
		assert.strictEqual(result[2].name, 'g3');
		assert.strictEqual(result[2].vendor, 'vendor2');
	});

	test('parseLanguageModelsConfiguration - complex configuration values', () => {
		const content = `[
	{
		"vendor": "vendor",
		"name": "group",
		"configurations": [
			{
				"configuration": {
					"str": "value",
					"num": 123,
					"bool": true,
					"null": null,
					"arr": [1, 2],
					"obj": { "nested": "val" }
				}
			}
		]
	}
]`;
		const model = testDisposables.add(createTextModel(content));
		const result = parseLanguageModelsProviderGroups(model);

		const configurations = result[0]?.configurations as { configuration: Record<string, unknown> }[];
		const config = configurations[0].configuration;
		assert.strictEqual(config.str, 'value');
		assert.strictEqual(config.num, 123);
		assert.strictEqual(config.bool, true);
		assert.strictEqual(config.null, null);
		assert.deepStrictEqual(config.arr, [1, 2]);
		assert.deepStrictEqual(config.obj, { nested: 'val' });
	});

	test('parseLanguageModelsConfiguration - with comments', () => {
		const content = `[
	// This is a comment
	/* Block comment */
	{
		"vendor": "vendor",
		"name": "group",
		"configurations": []
	}
]`;
		const model = testDisposables.add(createTextModel(content));
		const result = parseLanguageModelsProviderGroups(model);

		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].name, 'group');
		assert.strictEqual(result[0].vendor, 'vendor');
	});

	test('parseLanguageModelsConfiguration - ranges', () => {
		const content = `[
	{
		"vendor": "vendor",
		"name": "g1",
		"configurations": []
	},
	{
		"vendor": "vendor",
		"name": "g2",
		"configurations": []
	}
]`;
		const model = testDisposables.add(createTextModel(content));
		const result = parseLanguageModelsProviderGroups(model);

		const g1 = result[0];
		const g2 = result[1];

		assert.ok(g1.range);
		assert.ok(g2.range);
		assert.strictEqual(g1.range.startLineNumber, 2);
		assert.strictEqual(g1.range.endLineNumber, 6);
		assert.strictEqual(g2.range.startLineNumber, 7);
		assert.strictEqual(g2.range.endLineNumber, 11);
	});

	test('parseLanguageModelsConfiguration - models range', () => {
		const content = `[
	{
		"vendor": "vendor",
		"name": "group",
		"models": [
			{ "id": "one" },
			{ "id": "two" }
		]
	}
]`;
		const model = testDisposables.add(createTextModel(content));
		const result = parseLanguageModelsProviderGroups(model);

		assert.deepStrictEqual({
			startLineNumber: result[0].modelsRange?.startLineNumber,
			endLineNumber: result[0].modelsRange?.endLineNumber
		}, {
			startLineNumber: 5,
			endLineNumber: 8
		});
	});

	test('parseLanguageModelsConfiguration - empty models range', () => {
		const content = JSON.stringify([{
			vendor: 'vendor',
			name: 'group',
			models: []
		}], null, '\t');
		const model = testDisposables.add(createTextModel(content));
		const result = parseLanguageModelsProviderGroups(model);

		assert.deepStrictEqual(result[0].modelsRange, {
			startLineNumber: 5,
			startColumn: 13,
			endLineNumber: 5,
			endColumn: 15
		});
	});

	suite('schema contribution', () => {
		const schemaId = 'vscode://schemas/language-models';
		const profile = toUserDataProfile('test', 'Test', URI.parse('vscode-userdata:/profiles/test'), URI.parse('vscode-userdata:/cache'));
		const configurationFile = profile.languageModelsResource;
		const registry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		let vendors: ILanguageModelProviderDescriptor[];
		let models: Map<string, ILanguageModelChatMetadata>;
		let schemas: IJSONSchema[];
		let changedModels: Emitter<string>;
		let instantiationService: TestInstantiationService;

		setup(() => {
			vendors = [];
			models = new Map();
			schemas = [];
			changedModels = testDisposables.add(new Emitter<string>());
			instantiationService = testDisposables.add(new TestInstantiationService());
			instantiationService.stub(IUserDataProfileService, { currentProfile: profile });
			instantiationService.stub(ILanguageModelsService, {
				getVendors: () => vendors,
				getLanguageModelIds: () => [...models.keys()],
				lookupLanguageModel: id => models.get(id),
				onDidChangeLanguageModels: changedModels.event,
			});
			sinon.stub(registry, 'registerSchema').callsFake((_uri, schema) => schemas.push(schema));
		});

		teardown(() => sinon.restore());

		test('publishes existing vendor and model schemas using the profile resource', () => {
			const modelConfiguration: IJSONSchema = { properties: { temperature: { type: 'number' } } };
			vendors.push({
				vendor: 'test-vendor',
				displayName: 'Test Vendor',
				configuration: undefined,
				managementCommand: undefined,
				when: undefined,
				isDefault: false,
			});
			models.set('model-key', {
				id: 'test-model',
				name: 'Test Model',
				vendor: 'test-vendor',
				family: 'test-family',
				version: '1',
				extension: new ExtensionIdentifier('test.extension'),
				maxInputTokens: 100,
				maxOutputTokens: 100,
				isDefaultForLocation: {},
				configurationSchema: modelConfiguration,
			});

			testDisposables.add(instantiationService.createInstance(ChatLanguageModelsDataContribution));

			assert.deepStrictEqual({
				association: registry.getSchemaAssociations()[schemaId],
				schemas,
			}, {
				association: [configurationFile.toString()],
				schemas: [{
					type: 'array',
					items: {
						properties: {
							vendor: { type: 'string', enum: ['test-vendor'] },
							name: { type: 'string' },
							settings: { type: 'object', description: 'Per-model settings' },
						},
						allOf: [
							{ if: { properties: { vendor: { const: 'test-vendor' } } }, then: undefined },
							{
								if: { properties: { vendor: { const: 'test-vendor' } } },
								then: { properties: { settings: { type: 'object', properties: { 'test-model': modelConfiguration } } } },
							},
						],
						required: ['vendor', 'name'],
					},
				}],
			});
		});

		test('refreshes after initialization and stops observing on disposal', () => {
			const contribution = testDisposables.add(instantiationService.createInstance(ChatLanguageModelsDataContribution));
			const initialSchema = schemas[0];
			vendors.push({
				vendor: 'late-vendor',
				displayName: 'Late Vendor',
				configuration: undefined,
				managementCommand: undefined,
				when: undefined,
				isDefault: false,
			});
			changedModels.fire('late-model');
			const updatedSchema = schemas[1];
			contribution.dispose();
			changedModels.fire('after-disposal');

			assert.deepStrictEqual({
				initialVendors: (initialSchema.items as IJSONSchema).properties?.vendor.enum,
				updatedVendors: (updatedSchema.items as IJSONSchema).properties?.vendor.enum,
				schemaUpdates: schemas.length,
				association: registry.getSchemaAssociations()[schemaId],
			}, {
				initialVendors: [],
				updatedVendors: ['late-vendor'],
				schemaUpdates: 2,
				association: undefined,
			});
		});
	});
});
