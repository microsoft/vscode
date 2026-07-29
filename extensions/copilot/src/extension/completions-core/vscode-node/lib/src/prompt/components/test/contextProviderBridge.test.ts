/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CodeSnippet, ContextProvider, ContextResolver, SupportedContextItem, Trait, type DiagnosticBag } from '../../../../../types/src';
import { createCompletionState } from '../../../completionState';
import { ICompletionsFeaturesService } from '../../../experiments/featuresService';
import { TelemetryWithExp } from '../../../telemetry';
import { createLibTestingContext } from '../../../test/context';
import { createTextDocument } from '../../../test/textDocument';
import { LocationFactory } from '../../../textDocument';
import { ICompletionsContextProviderRegistryService } from '../../contextProviderRegistry';
import { ContextProviderBridge } from './../contextProviderBridge';

suite('Context Provider Bridge', function () {
	let accessor: ServicesAccessor;
	let bridge: ContextProviderBridge;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
		const featuresService = accessor.get(ICompletionsFeaturesService);
		accessor.get(ICompletionsContextProviderRegistryService).registerContextProvider(new TestContextProvider());
		featuresService.contextProviders = () => ['testContextProvider'];
		bridge = accessor.get(IInstantiationService).createInstance(ContextProviderBridge);
	});

	test('await context resolution by id', async function () {
		const state = testCompletionState();

		bridge.schedule(state, 'id', 'opId', TelemetryWithExp.createEmptyConfigForTesting());
		const items = await bridge.resolution('id');

		assert.deepStrictEqual(items.length, 1);
		assert.deepStrictEqual(items[0].providerId, 'testContextProvider');
		assert.deepStrictEqual((items[0].data[0] as Trait).name, 'test');
		assert.deepStrictEqual((items[0].data[0] as Trait).value, 'test');
	});

	test('await context resolution by id twice', async function () {
		const state = testCompletionState();
		bridge.schedule(state, 'id', 'opId', TelemetryWithExp.createEmptyConfigForTesting());

		const items1 = await bridge.resolution('id');
		const items2 = await bridge.resolution('id');

		assert.deepStrictEqual(items1.length, 1);
		assert.deepStrictEqual(items1[0].providerId, 'testContextProvider');
		assert.deepStrictEqual((items1[0].data[0] as Trait).name, 'test');
		assert.deepStrictEqual((items1[0].data[0] as Trait).value, 'test');
		assert.deepStrictEqual(items1, items2);
	});

	test('no schedule called returns empty array', async function () {
		const items = await bridge.resolution('unknown-id');

		assert.deepStrictEqual(items, []);
	});

	test('error in context resolution', async function () {
		const featuresService = accessor.get(ICompletionsFeaturesService);
		accessor.get(ICompletionsContextProviderRegistryService).registerContextProvider(
			new TestContextProvider({ shouldThrow: true, id: 'errorProvider' })
		);
		featuresService.contextProviders = () => ['errorProvider'];
		const errorBridge = accessor.get(IInstantiationService).createInstance(ContextProviderBridge);
		const state = testCompletionState();

		errorBridge.schedule(state, 'err-id', 'opId', TelemetryWithExp.createEmptyConfigForTesting());
		const items = await errorBridge.resolution('err-id');

		const errorItem = items.find(i => i.providerId === 'errorProvider');
		assert.deepStrictEqual(errorItem?.resolution, 'error');
	});

	test('multiple schedules and resolutions', async function () {
		const state1 = testCompletionState();
		const state2 = testCompletionState();

		bridge.schedule(state1, 'id1', 'opId', TelemetryWithExp.createEmptyConfigForTesting());
		bridge.schedule(state2, 'id2', 'opId', TelemetryWithExp.createEmptyConfigForTesting());

		const items1 = await bridge.resolution('id1');
		const items2 = await bridge.resolution('id2');

		assert.deepStrictEqual(items1.length, 1);
		assert.deepStrictEqual(items2.length, 1);
	});

	test('empty provider list returns empty array', async function () {
		const featuresService = accessor.get(ICompletionsFeaturesService);
		featuresService.contextProviders = () => [];
		const instantiationService = createLibTestingContext().createTestingAccessor().get(IInstantiationService);
		bridge = instantiationService.createInstance(ContextProviderBridge);
		const state = testCompletionState();

		bridge.schedule(state, 'empty-id', 'opId', TelemetryWithExp.createEmptyConfigForTesting());
		const items = await bridge.resolution('empty-id');

		assert.deepStrictEqual(items, []);
	});

	function testCompletionState() {
		const doc = createTextDocument('file:///fizzbuzz.go', 'go', 1, 'code');
		const position = LocationFactory.position(3, 0);
		return createCompletionState(doc, position);
	}
});

class TestContextResolver implements ContextResolver<SupportedContextItem> {
	private shouldThrow: boolean;
	constructor(opts?: { shouldThrow?: boolean }) {
		this.shouldThrow = opts?.shouldThrow ?? false;
	}

	async *resolve(): AsyncIterable<SupportedContextItem> {
		if (this.shouldThrow) {
			throw new Error('Test error');
		}
		yield Promise.resolve({ name: 'test', value: 'test' });
	}
}

class TestContextProvider implements ContextProvider<Trait | CodeSnippet | DiagnosticBag> {
	id: string;
	selector: string[];
	resolver: ContextResolver<CodeSnippet | Trait | DiagnosticBag>;

	constructor(opts?: { shouldThrow?: boolean; id?: string }) {
		this.id = opts?.id ?? 'testContextProvider';
		this.selector = ['*'];
		this.resolver = new TestContextResolver({ shouldThrow: opts?.shouldThrow });
	}
}
