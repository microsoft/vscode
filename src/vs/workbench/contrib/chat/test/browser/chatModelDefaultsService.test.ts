/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../base/common/collections.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ChatModelDefaultsService } from '../../browser/chatModelDefaultsService.js';
import { ChatModelConfigurationPersistence } from '../../common/chatModelConfigurationPersistence.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelConfigurationSchema } from '../../common/languageModels.js';

const modelId = 'example/model';
const schema: ILanguageModelConfigurationSchema = { properties: {
	reasoningEffort: { type: 'string', enum: ['default', 'low', 'high'], default: 'default' },
	contextSize: { type: 'integer', minimum: 1, maximum: 1_000_000, default: 1_000_000, suggestedValues: [{ value: 200_000 }] },
} };

suite('ChatModelDefaultsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	function fixture() {
		const storage = disposables.add(new InMemoryStorageService());
		const changed = disposables.add(new Emitter<string>());
		let metadata: ILanguageModelChatMetadata | undefined = {
			extension: new ExtensionIdentifier('example.extension'), vendor: 'example', id: 'model', name: 'Example',
			version: '1', family: 'example', maxInputTokens: 1_000_000, maxOutputTokens: 1000,
			isDefaultForLocation: {}, configurationSchema: structuredClone(schema),
		};
		let profile: IStringDictionary<unknown> = {};
		let failure = false;
		let delay: Promise<void> | undefined;
		const host = {
			_serviceBrand: undefined,
			onDidChangeLanguageModels: changed.event,
			getLanguageModelIds: () => metadata ? [modelId] : [],
			lookupLanguageModel: () => metadata,
			getModelConfiguration: () => ({ ...profile }),
			setModelConfiguration: async (_model: string, values: IStringDictionary<unknown>) => {
				await delay;
				if (failure) { throw new Error('write failed'); }
				profile = { ...profile, ...values };
				changed.fire('example');
			},
		};
		const persistence = new ChatModelConfigurationPersistence(storage, host);
		const service = disposables.add(new ChatModelDefaultsService(host, storage));
		const target = service.getTargets(modelId)[0].id;
		const key = ChatModelConfigurationPersistence.storageKey(ChatAgentLocation.Chat);
		return { service, persistence, target, key, profile: () => profile,
			fail: () => { failure = true; }, delay: (value: Promise<void>) => { delay = value; },
			metadata: (value: typeof metadata) => { metadata = value; changed.fire('example'); },
			inspect: () => service.inspect(modelId, target),
		};
	}

	test('native writes and API writes share scoped defaults and preserve unrelated entries', async () => {
		const f = fixture();
		f.persistence.writeEntry(f.key, 'other/model', { contextSize: 123 });
		f.persistence.writeEntry(f.key, modelId, { contextSize: 200_000, reasoningEffort: 'low' });
		const before = f.inspect();
		const updated = await f.service.update(modelId, f.target, { set: { contextSize: 250_000 } }, before.revision, () => {});
		assert.deepStrictEqual({ outcome: updated.outcome, effective: updated.snapshot.effective,
			stored: { ...f.persistence.readBucket(f.key) }, profile: f.profile() }, {
			outcome: 'applied', effective: { contextSize: 250_000, reasoningEffort: 'low' },
			stored: { 'other/model': { contextSize: 123 }, [modelId]: { contextSize: 250_000, reasoningEffort: 'low' } },
			profile: { contextSize: 250_000 },
		});
	});

	test('stale snapshots conflict without changing intervening native choices', async () => {
		const f = fixture();
		const before = f.inspect();
		f.persistence.writeEntry(f.key, modelId, { contextSize: 300_000 });
		const result = await f.service.update(modelId, f.target, { set: { contextSize: 200_000 } }, before.revision, () => {});
		assert.deepStrictEqual({ outcome: result.outcome, context: result.snapshot.effective.contextSize, profile: f.profile() },
			{ outcome: 'conflict', context: 300_000, profile: {} });
	});

	test('reset persists an empty scoped entry instead of falling back to profile', async () => {
		const f = fixture();
		f.persistence.writeEntry(f.key, modelId, { contextSize: 200_000 });
		const result = await f.service.update(modelId, f.target, { reset: ['contextSize'] }, f.inspect().revision, () => {});
		assert.deepStrictEqual({ outcome: result.outcome, stored: f.persistence.readBucket(f.key)[modelId], context: result.snapshot.effective.contextSize },
			{ outcome: 'applied', stored: {}, context: 1_000_000 });
	});

	test('revision includes schema, snapshots cannot mutate authority, and notifications invalidate reads', () => {
		const f = fixture();
		const before = f.inspect();
		before.effective.contextSize = 5;
		before.schema!.properties!.contextSize.maximum = 5;
		const notifications: string[] = [];
		disposables.add(f.service.onDidChange(e => notifications.push(e.targetId)));
		f.persistence.writeEntry(f.key, modelId, { contextSize: 250_000 });
		assert.deepStrictEqual({ max: f.inspect().schema!.properties!.contextSize.maximum, context: f.inspect().effective.contextSize, notifications },
			{ max: 1_000_000, context: 250_000, notifications: [f.target] });
	});

	test('partial mirror failure reports scoped result and never rolls it back', async () => {
		const f = fixture(); f.fail();
		const result = await f.service.update(modelId, f.target, { set: { contextSize: 250_000 } }, f.inspect().revision, () => {});
		assert.deepStrictEqual({ outcome: result.outcome, context: result.snapshot.effective.contextSize, profile: f.profile() },
			{ outcome: 'failed', context: 250_000, profile: {} });
	});

	test('queued patches are owned before the first asynchronous operation', async () => {
		const f = fixture(); const gate = new DeferredPromise<void>(); f.delay(gate.p);
		const patch = { set: { contextSize: 250_000 } };
		const pending = f.service.update(modelId, f.target, patch, f.inspect().revision, () => {});
		patch.set.contextSize = 500_000;
		await gate.complete();
		assert.strictEqual((await pending).snapshot.effective.contextSize, 250_000);
	});

	test('an intervening picker edit is reported rather than claimed as applied', async () => {
		const f = fixture(); const gate = new DeferredPromise<void>(); f.delay(gate.p);
		const pending = f.service.update(modelId, f.target, { set: { contextSize: 250_000 } }, f.inspect().revision, () => {});
		await Promise.resolve();
		f.persistence.writeEntry(f.key, modelId, { contextSize: 300_000 });
		await gate.complete();
		const result = await pending;
		assert.deepStrictEqual({ outcome: result.outcome, context: result.snapshot.effective.contextSize }, { outcome: 'conflict', context: 300_000 });
	});

	test('access is rechecked in the queued action', async () => {
		const f = fixture();
		await assert.rejects(f.service.update(modelId, f.target, { set: { contextSize: 250_000 } }, f.inspect().revision,
			() => { throw new Error('owner changed'); }), /owner changed/);
		assert.deepStrictEqual({ ...f.persistence.readBucket(f.key) }, {});
	});

	for (const patch of [
		{ set: { contextSize: 0 } }, { set: { contextSize: 1.5 } }, { set: { contextSize: 1_000_001 } },
		{ set: { contextSize: 'custom' } }, { set: { unknown: 'high' } },
		{ set: { contextSize: 10 }, reset: ['contextSize'] }, { reset: ['unknown'] },
	]) {
		test(`invalid patch does not persist: ${JSON.stringify(patch)}`, async () => {
			const f = fixture();
			await assert.rejects(f.service.update(modelId, f.target, patch, f.inspect().revision, () => {}));
			assert.deepStrictEqual(f.profile(), {});
		});
	}

	test('unknown targets reject and removed models become unavailable', () => {
		const f = fixture();
		assert.throws(() => f.service.inspect(modelId, 'arbitrary'), /Unsupported/);
		f.metadata(undefined);
		assert.deepStrictEqual({ targets: f.service.getTargets(modelId), status: f.inspect().status }, { targets: [], status: 'unavailable' });
	});
});
