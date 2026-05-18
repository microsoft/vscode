/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { createDefaultModelArrays, DefaultModelArrays, DefaultModelContribution } from '../../browser/defaultModelContribution.js';
import { ILanguageModelChatMetadata, ILanguageModelProviderDescriptor, ILanguageModelsService } from '../../common/languageModels.js';

class TestLanguageModelsService implements Partial<ILanguageModelsService> {
	private readonly _models = new Map<string, ILanguageModelChatMetadata>();
	private readonly _vendors: ILanguageModelProviderDescriptor[] = [];
	private _modelCounter = 0;

	private readonly _onDidChangeLanguageModels = new Emitter<string>();
	readonly onDidChangeLanguageModels = this._onDidChangeLanguageModels.event;

	addVendor(vendor: ILanguageModelProviderDescriptor): void {
		this._vendors.push(vendor);
	}

	addModel(metadata: ILanguageModelChatMetadata): void {
		// Use an internal unique key so callers can register multiple models
		// that share the same `${vendor}/${id}` (different provider groups).
		this._models.set(`${this._modelCounter++}:${metadata.vendor}/${metadata.id}`, metadata);
	}

	getLanguageModelIds(): string[] {
		return Array.from(this._models.keys());
	}

	lookupLanguageModel(id: string): ILanguageModelChatMetadata | undefined {
		return this._models.get(id);
	}

	getVendors(): ILanguageModelProviderDescriptor[] {
		return this._vendors;
	}

	dispose(): void {
		this._onDidChangeLanguageModels.dispose();
	}
}

class TestContribution extends DefaultModelContribution {
	constructor(
		arrays: DefaultModelArrays,
		storageFormat: 'qualifiedName' | 'vendorAndId' | undefined,
		languageModelsService: ILanguageModelsService,
	) {
		super(
			arrays,
			{
				configKey: 'test.utilityModel',
				configSectionId: undefined,
				logPrefix: '[Test]',
				storageFormat,
			},
			languageModelsService,
			new NullLogService(),
		);
	}
}

function makeMetadata(overrides: Partial<ILanguageModelChatMetadata> & Pick<ILanguageModelChatMetadata, 'id' | 'name' | 'vendor'>): ILanguageModelChatMetadata {
	return {
		version: '1.0',
		family: 'test',
		extension: new ExtensionIdentifier('test.ext'),
		isUserSelectable: true,
		maxInputTokens: 4096,
		maxOutputTokens: 1024,
		capabilities: { toolCalling: true },
		isDefaultForLocation: {},
		...overrides,
	} satisfies ILanguageModelChatMetadata;
}

suite('DefaultModelContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(opts?: { models?: ILanguageModelChatMetadata[]; vendors?: ILanguageModelProviderDescriptor[]; storageFormat?: 'qualifiedName' | 'vendorAndId' }) {
		const service = new TestLanguageModelsService();
		store.add({ dispose: () => service.dispose() });

		for (const v of opts?.vendors ?? []) {
			service.addVendor(v);
		}
		for (const m of opts?.models ?? []) {
			service.addModel(m);
		}

		const arrays = createDefaultModelArrays();
		const contribution = store.add(new TestContribution(arrays, opts?.storageFormat, service as unknown as ILanguageModelsService));
		return { arrays, contribution, service };
	}

	test('default state — no models registered yields only the empty/auto entry', () => {
		const { arrays } = setup();

		assert.deepStrictEqual(
			{ ids: arrays.modelIds, labels: arrays.modelLabels },
			{ ids: [''], labels: ['Auto (Vendor Default)'] },
		);
	});

	test('copilot vendor model — stored as vendor/id with vendor display name in the label', () => {
		const { arrays } = setup({
			storageFormat: 'vendorAndId',
			vendors: [{ vendor: 'copilot', displayName: 'Copilot', isDefault: true, configuration: undefined, managementCommand: undefined, when: undefined }],
			models: [makeMetadata({ id: 'gpt-4o-mini', name: 'GPT 4o mini', vendor: 'copilot' })],
		});
		assert.deepStrictEqual(
			{ ids: arrays.modelIds, labels: arrays.modelLabels },
			{
				ids: ['', 'copilot/gpt-4o-mini'],
				labels: ['Auto (Vendor Default)', 'GPT 4o mini (Copilot)'],
			},
		);
	});

	test('third-party (BYOK) vendor model — stored as vendor/id with provider display name', () => {
		const { arrays } = setup({
			storageFormat: 'vendorAndId',
			vendors: [
				{ vendor: 'copilot', displayName: 'Copilot', isDefault: true, configuration: undefined, managementCommand: undefined, when: undefined },
				{ vendor: 'anthropic', displayName: 'Anthropic', isDefault: false, configuration: undefined, managementCommand: undefined, when: undefined },
			],
			models: [
				makeMetadata({ id: 'gpt-4o-mini', name: 'GPT 4o mini', vendor: 'copilot' }),
				// BYOK providers may omit `isUserSelectable` — must still be included.
				makeMetadata({ id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', vendor: 'anthropic', isUserSelectable: undefined }),
				// Internal alias models opt out via explicit false — must be excluded.
				makeMetadata({ id: 'copilot-utility', name: 'Utility', vendor: 'copilot', isUserSelectable: false }),
			],
		});
		assert.deepStrictEqual(
			{ ids: arrays.modelIds, labels: arrays.modelLabels },
			{
				ids: ['', 'anthropic/claude-haiku-4.5', 'copilot/gpt-4o-mini'],
				labels: ['Auto (Vendor Default)', 'Claude Haiku 4.5 (Anthropic)', 'GPT 4o mini (Copilot)'],
			},
		);
	});

	test('hidden vendor cache entries are excluded from the picker', () => {
		const { arrays } = setup({
			storageFormat: 'vendorAndId',
			vendors: [{ vendor: 'copilot', displayName: 'Copilot', isDefault: true, configuration: undefined, managementCommand: undefined, when: undefined }],
			models: [
				makeMetadata({ id: 'gpt-4o-mini', name: 'GPT 4o mini', vendor: 'copilot' }),
				makeMetadata({ id: 'hidden-model', name: 'Hidden Model', vendor: 'hidden-vendor' }),
			],
		});
		assert.deepStrictEqual(
			{ ids: arrays.modelIds, labels: arrays.modelLabels },
			{
				ids: ['', 'copilot/gpt-4o-mini'],
				labels: ['Auto (Vendor Default)', 'GPT 4o mini (Copilot)'],
			},
		);
	});

	test('ambiguous vendor/id — duplicate keys (e.g. same id in two provider groups) are excluded from the picker', () => {
		const { arrays } = setup({
			storageFormat: 'vendorAndId',
			vendors: [{ vendor: 'anthropic', displayName: 'Anthropic', isDefault: false, configuration: undefined, managementCommand: undefined, when: undefined }],
			models: [
				// Two distinct configured groups for the same vendor expose
				// the same model id. The setting value would be ambiguous,
				// so neither must appear in the enum.
				makeMetadata({ id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', vendor: 'anthropic' }),
				makeMetadata({ id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', vendor: 'anthropic' }),
				// A non-conflicting model from the same vendor must remain.
				makeMetadata({ id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', vendor: 'anthropic' }),
			],
		});
		assert.deepStrictEqual(
			{ ids: arrays.modelIds, labels: arrays.modelLabels },
			{
				ids: ['', 'anthropic/claude-sonnet-4.5'],
				labels: ['Auto (Vendor Default)', 'Claude Sonnet 4.5 (Anthropic)'],
			},
		);
	});
});
