/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { createDefaultModelArrays, DefaultModelArrays, DefaultModelContribution } from '../../browser/defaultModelContribution.js';
import { ILanguageModelChatMetadata, ILanguageModelProviderDescriptor, ILanguageModelsService } from '../../common/languageModels.js';

class TestLanguageModelsService implements Partial<ILanguageModelsService> {
	private readonly _models = new Map<string, ILanguageModelChatMetadata>();
	private readonly _vendors: ILanguageModelProviderDescriptor[] = [];

	private readonly _onDidChangeLanguageModels = new Emitter<string>();
	readonly onDidChangeLanguageModels = this._onDidChangeLanguageModels.event;

	private readonly _onDidChangeLanguageModelVendors = new Emitter<readonly string[]>();
	readonly onDidChangeLanguageModelVendors = this._onDidChangeLanguageModelVendors.event;

	addVendor(vendor: ILanguageModelProviderDescriptor): void {
		this._vendors.push(vendor);
	}

	addModel(metadata: ILanguageModelChatMetadata): void {
		this._models.set(metadata.id, metadata);
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

	async selectLanguageModels(): Promise<string[]> {
		return Array.from(this._models.keys());
	}

	dispose(): void {
		this._onDidChangeLanguageModels.dispose();
		this._onDidChangeLanguageModelVendors.dispose();
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

/**
 * Wait for all microtasks to settle so that the constructor's
 * `selectLanguageModels({}).then(...)` has run.
 */
async function flush(): Promise<void> {
	await new Promise<void>(r => queueMicrotask(r));
	await new Promise<void>(r => queueMicrotask(r));
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

	test('default state — no models registered yields only the empty/auto entry', async () => {
		const { arrays } = setup();
		await flush();

		assert.deepStrictEqual(
			{ ids: arrays.modelIds, labels: arrays.modelLabels },
			{ ids: [''], labels: ['Auto (Vendor Default)'] },
		);
	});

	test('copilot vendor model — stored as vendor/id with vendor display name in the label', async () => {
		const { arrays } = setup({
			storageFormat: 'vendorAndId',
			vendors: [{ vendor: 'copilot', displayName: 'Copilot', isDefault: true, configuration: undefined, managementCommand: undefined, when: undefined }],
			models: [makeMetadata({ id: 'gpt-4o-mini', name: 'GPT 4o mini', vendor: 'copilot' })],
		});
		await flush();

		assert.deepStrictEqual(
			{ ids: arrays.modelIds, labels: arrays.modelLabels },
			{
				ids: ['', 'copilot/gpt-4o-mini'],
				labels: ['Auto (Vendor Default)', 'GPT 4o mini (Copilot)'],
			},
		);
	});

	test('third-party (BYOK) vendor model — stored as vendor/id with provider display name', async () => {
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
		await flush();

		assert.deepStrictEqual(
			{ ids: arrays.modelIds, labels: arrays.modelLabels },
			{
				ids: ['', 'anthropic/claude-haiku-4.5', 'copilot/gpt-4o-mini'],
				labels: ['Auto (Vendor Default)', 'Claude Haiku 4.5 (Anthropic)', 'GPT 4o mini (Copilot)'],
			},
		);
	});
});

// Silence unused-import warning when the suite is tree-shaken in some target builds.
void Event.None;
