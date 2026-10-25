/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ExperimentationService as TASClient } from 'tas-client';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { cleanData, NullTelemetryService, NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { resolveScopedTreatment, resolveTreatmentWithAssignment, toExperimentTelemetryData, WorkbenchAssignmentService } from '../../common/assignmentService.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { ITelemetryData } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';

suite('resolveScopedTreatment', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const BARE = 'config.chat.agentHost.copilot.multiTurnContextRouting.enabled';
	const SCOPED = `/vscode/${BARE}`;

	function readFrom(values: Record<string, string | number | boolean>): (name: string) => string | number | boolean | undefined {
		return name => values[name];
	}

	test('prefers the /vscode/ scoped value (new endpoint) over the bare value on collision', () => {
		const read = readFrom({ [BARE]: 'legacy', [SCOPED]: 'new' });
		assert.strictEqual(resolveScopedTreatment(read, BARE), 'new');
	});

	test('falls back to the bare value when only the legacy endpoint assigns it', () => {
		const read = readFrom({ [BARE]: 'legacy' });
		assert.strictEqual(resolveScopedTreatment(read, BARE), 'legacy');
	});

	test('uses the scoped value when only the new endpoint assigns it', () => {
		const read = readFrom({ [SCOPED]: 'new' });
		assert.strictEqual(resolveScopedTreatment(read, BARE), 'new');
	});

	test('returns undefined when neither endpoint assigns it', () => {
		const read = readFrom({});
		assert.strictEqual(resolveScopedTreatment(read, BARE), undefined);
	});

	test('preserves a defined falsy scoped value instead of falling back to bare', () => {
		const read = readFrom({ [BARE]: true, [SCOPED]: false });
		assert.strictEqual(resolveScopedTreatment(read, BARE), false);
	});
});

suite('resolveTreatmentWithAssignment', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('distinguishes real assignments from developer overrides, including falsy values', async () => {
		const results = [];
		for (const assignment of [undefined, false, 0, '', 'treatment']) {
			for (const override of [undefined, false, 0, '', 'override']) {
				let reads = 0;
				const result = await resolveTreatmentWithAssignment(override, async () => {
					reads++;
					return assignment;
				});
				results.push({ value: result.value, assigned: await result.hasAssignment, reads });
			}
		}
		assert.deepStrictEqual(results, [undefined, false, 0, '', 'treatment'].flatMap(assignment =>
			[undefined, false, 0, '', 'override'].map(override => ({
				value: override !== undefined ? override : assignment,
				assigned: assignment !== undefined,
				reads: 1,
			}))
		));
	});

	suite('WorkbenchAssignmentService treatment lifetime', () => {
		function createService() {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService();
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
			instantiationService.stub(ITelemetryService, NullTelemetryService);
			instantiationService.stub(IProductService, {});
			instantiationService.stub(IWorkbenchEnvironmentService, {});
			const service = store.add(instantiationService.createInstance(WorkbenchAssignmentService));
			Object.defineProperty(service, 'experimentsEnabled', { value: true });
			return service;
		}

		function createClient(value: string, fetch: () => Promise<void>) {
			let reads = 0;
			const client = new class extends mock<TASClient>() {
				override async getTreatmentVariableAsync<T extends string | number | boolean>(): Promise<T | undefined> {
					await fetch();
					return undefined;
				}
				override getTreatmentVariable<T extends string | number | boolean>(): T | undefined {
					reads++;
					return value as T;
				}
			}();
			return { client, reads: () => reads };
		}

		/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Inject TAS clients without starting real network requests. */
		for (const withAssignment of [false, true]) {
			test(`${withAssignment ? 'assignment-aware' : 'legacy'} reads preserve their disposal contract`, async () => {
				const service = createService();
				const started = new DeferredPromise<void>();
				const fetched = new DeferredPromise<void>();
				const { client, reads } = createClient('treatment', async () => {
					await started.complete();
					await fetched.p;
				});
				service['tasClient'] = Promise.resolve(client);
				const pending = withAssignment ? service.getTreatmentWithAssignment('test') : service.getTreatment('test');
				await started.p;
				service.dispose();
				await fetched.complete();
				if (withAssignment) {
					await assert.rejects(pending, isCancellationError);
					assert.strictEqual(reads(), 0);
				} else {
					assert.strictEqual(await pending, 'treatment');
				}
			});
		}

		test('retries a replaced client once without reading its stale treatment', async () => {
			const service = createService();
			const current = createClient('current', async () => { });
			const stale = createClient('stale', async () => { service['tasClient'] = Promise.resolve(current.client); });
			service['tasClient'] = Promise.resolve(stale.client);
			const result = await service.getTreatmentWithAssignment('test');
			assert.deepStrictEqual({ value: result.value, assigned: await result.hasAssignment, staleReads: stale.reads(), currentReads: current.reads() },
				{ value: 'current', assigned: true, staleReads: 0, currentReads: 1 });
		});

		test('cancels after a second replacement instead of retrying indefinitely', async () => {
			const service = createService();
			const third = createClient('third', async () => { });
			const second = createClient('second', async () => { service['tasClient'] = Promise.resolve(third.client); });
			const first = createClient('first', async () => { service['tasClient'] = Promise.resolve(second.client); });
			service['tasClient'] = Promise.resolve(first.client);
			await assert.rejects(service.getTreatmentWithAssignment('test'), isCancellationError);
			assert.deepStrictEqual([first.reads(), second.reads(), third.reads()], [0, 0, 0]);
		});
		/* eslint-enable local/code-no-bracket-notation-for-identifiers */
	});

	test('does not delay a developer override while assignment metadata loads', async () => {
		const assignment = new DeferredPromise<string | undefined>();
		const result = await resolveTreatmentWithAssignment('override', () => assignment.p);
		assert.strictEqual(result.value, 'override');
		await assignment.complete('treatment');
		assert.strictEqual(await result.hasAssignment, true);
	});

	test('does not disguise assignment errors as absence', async () => {
		const error = new Error('assignment unavailable');
		const result = await resolveTreatmentWithAssignment('override', async () => { throw error; });
		await assert.rejects(result.hasAssignment, error);
		await assert.rejects(resolveTreatmentWithAssignment(undefined, async () => { throw error; }), error);
	});
});

suite('WorkbenchAssignmentService telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const contextProperty = 'abexp.assignmentcontext';

	async function createService() {
		const events: { eventName: string; data: ITelemetryData | undefined; assignmentContext: string | undefined }[] = [];
		let assignmentContext: string | undefined;
		const telemetryService = new class extends NullTelemetryServiceShape {
			override setExperimentProperty(name?: string, value?: string): void {
				if (name === contextProperty) {
					assignmentContext = value;
				}
			}
			override publicLog(eventName?: string, data?: ITelemetryData): void {
				if (eventName) {
					events.push({ eventName, data, assignmentContext });
				}
			}
			override publicLog2(eventName?: string, data?: ITelemetryData): void {
				this.publicLog(eventName, data);
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(IProductService, {
			tasConfig: { endpoint: '', telemetryEventName: 'query-expfeature', assignmentContextTelemetryPropertyName: contextProperty }
		});
		instantiationService.stub(IWorkbenchEnvironmentService, {});
		const service = store.add(instantiationService.createInstance(WorkbenchAssignmentService));
		Object.defineProperty(service, 'experimentsEnabled', { value: true });

		let value: string | number | boolean | undefined;
		let reads = 0;
		const client = new class extends mock<TASClient>() {
			override async getTreatmentVariableAsync<T extends string | number | boolean>(): Promise<T | undefined> {
				reads++;
				return undefined;
			}
			override getTreatmentVariable<T extends string | number | boolean>(): T | undefined {
				return value as T | undefined;
			}
		}();
		/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Inject TAS state without starting real network requests. */
		service['tasClient'] = Promise.resolve(client);
		// Let the initialization timer dispose its cancellation listeners before test teardown.
		await service['overrideInitDelay'];
		const setContext = (context: string) => service['telemetry'].setSharedProperty(contextProperty, context);
		const postEvent = (eventName: string, props: Map<string, string>) => service['telemetry'].postEvent(eventName, props);
		/* eslint-enable local/code-no-bracket-notation-for-identifiers */
		return { service, events, configuration, setContext, postEvent, setValue: (next: typeof value) => { value = next; }, reads: () => reads };
	}

	function expectedEvent(value: string | number | boolean | undefined, assignmentContext?: string, treatmentName = 'test') {
		return {
			eventName: 'tasClientReadTreatmentComplete',
			data: { treatmentName, treatmentValue: JSON.stringify(value) },
			assignmentContext
		};
	}

	test('deduplicates concurrent reads across both APIs without skipping assignment reads', async () => {
		const { service, events, reads } = await createService();
		const results = await Promise.all([
			service.getTreatment('test'),
			service.getTreatmentWithAssignment('test'),
			service.getTreatment('test'),
		]);
		assert.deepStrictEqual({ results, assigned: await results[1].hasAssignment, reads: reads(), events }, {
			results: [undefined, { value: undefined, hasAssignment: results[1].hasAssignment }, undefined],
			assigned: false,
			reads: 3,
			events: [expectedEvent(undefined)],
		});
	});

	test('preserves value transitions, falsy values and returning to earlier values', async () => {
		const { service, events, setValue } = await createService();
		const values = [undefined, false, 0, '', 'A', 'B', 'A', undefined];
		const results = [];
		for (const value of values) {
			setValue(value);
			results.push(await service.getTreatment('test'));
			const result = await service.getTreatmentWithAssignment('test');
			results.push({ value: result.value, assigned: await result.hasAssignment });
		}
		assert.deepStrictEqual({ results, events }, {
			results: values.flatMap(value => [value, { value, assigned: value !== undefined }]),
			events: values.map(value => expectedEvent(value)),
		});
	});

	test('preserves context transitions without changing refresh notifications', async () => {
		const { service, events, setContext, setValue } = await createService();
		setValue('value');
		let refreshes = 0;
		store.add(service.onDidRefetchAssignments(() => refreshes++));
		await service.getTreatment('test');
		for (const context of ['A', 'A', 'B', 'B', 'A', '', '']) {
			setContext(context);
			await service.getTreatment('test');
		}
		assert.deepStrictEqual({ events, refreshes }, {
			events: [undefined, 'A', 'B', 'A', ''].map(context => expectedEvent('value', context)),
			refreshes: 7,
		});
	});

	test('deduplicates using the filtered telemetry context', async () => {
		const { service, events, setContext } = await createService();
		service.addTelemetryAssignmentFilter({ id: 'test', exclude: id => id === 'hidden', onDidChange: Event.None });
		setContext('A;hidden');
		await service.getTreatment('test');
		setContext('A');
		await service.getTreatmentWithAssignment('test');
		assert.deepStrictEqual(events, [expectedEvent(undefined, 'A')]);
	});

	test('tracks treatments and service instances independently', async () => {
		const first = await createService();
		const second = await createService();
		await first.service.getTreatment('test');
		await first.service.getTreatment('another');
		await first.service.getTreatment('test');
		await second.service.getTreatment('test');
		assert.deepStrictEqual([first.events, second.events], [
			[expectedEvent(undefined), expectedEvent(undefined, undefined, 'another')],
			[expectedEvent(undefined)],
		]);
	});

	test('preserves developer override transitions without changing assignment metadata', async () => {
		const { service, events, configuration, setValue } = await createService();
		setValue('assigned');
		for (const override of ['override', 'override', 'changed']) {
			await configuration.setUserConfiguration('experiments.override.test', override);
			const result = await service.getTreatmentWithAssignment('test');
			assert.deepStrictEqual({ value: result.value, assigned: await result.hasAssignment }, { value: override, assigned: true });
		}
		assert.deepStrictEqual(events, [expectedEvent('override'), expectedEvent('changed')]);
	});

	suite('assignments-validation', () => {
		function validationProperties(overrides: Record<string, string> = {}): Map<string, string> {
			return new Map(Object.entries({
				FeatureVariableCount: '0',
				AssignedVariantCount: '0',
				DataVersion: '1',
				AssignmentContext: '',
				...overrides,
			}));
		}

		function expectedValidation(props: Map<string, string>, assignmentContext?: string) {
			return { eventName: 'assignments-validation', data: Object.fromEntries(props), assignmentContext };
		}

		test('logs the first payload and suppresses duplicates regardless of property order', async () => {
			const { postEvent, events } = await createService();
			const props = validationProperties();
			postEvent('assignments-validation', props);
			postEvent('assignments-validation', new Map(props));
			postEvent('assignments-validation', new Map([...props].reverse()));
			assert.deepStrictEqual(events, [expectedValidation(props)]);
		});

		for (const [property, value] of Object.entries({
			FeatureVariableCount: '1',
			AssignedVariantCount: '1',
			DataVersion: '2',
			AssignmentContext: 'B',
		})) {
			test(`preserves ${property} transitions including returning to an earlier value`, async () => {
				const { postEvent, events } = await createService();
				const original = validationProperties();
				const changed = validationProperties({ [property]: value });
				for (const props of [original, original, changed, changed, original]) {
					postEvent('assignments-validation', props);
				}
				assert.deepStrictEqual(events, [original, changed, original].map(props => expectedValidation(props)));
			});
		}

		test('snapshots mutable payloads and detects added and removed properties', async () => {
			const { postEvent, events } = await createService();
			const props = validationProperties();
			const original = expectedValidation(props);
			postEvent('assignments-validation', props);
			props.set('FeatureVariableCount', '1');
			const changed = expectedValidation(props);
			postEvent('assignments-validation', props);
			props.delete('FeatureVariableCount');
			const removed = expectedValidation(props);
			postEvent('assignments-validation', props);
			props.set('FeatureVariableCount', '1');
			postEvent('assignments-validation', props);
			assert.deepStrictEqual(events, [original, changed, removed, changed]);
		});

		test('preserves changes to the filtered common context independently of the payload', async () => {
			const { service, postEvent, events, setContext } = await createService();
			const props = validationProperties();
			service.addTelemetryAssignmentFilter({ id: 'test', exclude: id => id === 'hidden', onDidChange: Event.None });
			postEvent('assignments-validation', props);
			for (const context of ['A;hidden', 'A', 'B', 'B', 'A', '', '']) {
				setContext(context);
				postEvent('assignments-validation', props);
			}
			assert.deepStrictEqual(events, [undefined, 'A', 'B', 'A', ''].map(context => expectedValidation(props, context)));
		});

		test('tracks service instances independently', async () => {
			const first = await createService();
			const second = await createService();
			const props = validationProperties();
			first.postEvent('assignments-validation', props);
			first.postEvent('assignments-validation', props);
			second.postEvent('assignments-validation', props);
			assert.deepStrictEqual([first.events, second.events], [
				[expectedValidation(props)],
				[expectedValidation(props)],
			]);
		});

		test('does not suppress other SDK events or reset validation deduplication', async () => {
			const { postEvent, events } = await createService();
			const props = validationProperties();
			postEvent('assignments-validation', props);
			const otherEvents: [string, Map<string, string>][] = [
				['tas-call', new Map([['callType', 'assignments'], ['outcome', 'Success'], ['extensionName', 'vscode-core'], ['assignmentContext', 'A']])],
				['tas-call', new Map([['callType', 'assignments'], ['outcome', 'ServerError'], ['extensionName', 'vscode-core'], ['assignmentContext', '']])],
				['call-assignments-error', new Map([['ErrorType', 'ServerError']])],
				['query-expfeature', new Map([['ABExp.queriedFeature', 'vscode.test']])],
			];
			for (const [name, properties] of otherEvents) {
				postEvent(name, properties);
				postEvent(name, properties);
			}
			postEvent('assignments-validation', props);
			assert.deepStrictEqual(events, [
				expectedValidation(props),
				...otherEvents.flatMap(([eventName, properties]) => Array.from({ length: 2 }, () => ({
					eventName, data: toExperimentTelemetryData(properties), assignmentContext: undefined
				}))),
			]);
		});
	});
});

suite('toExperimentTelemetryData', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('marks the queried feature name trusted so a /vscode/-scoped key survives telemetry cleaning', () => {
		const scoped = '/vscode/config.chat.agentHost.copilot.multiTurnContextRouting.enabled';
		const data = toExperimentTelemetryData(new Map([['ABExp.queriedFeature', scoped]]));

		// The trusted feature name survives cleaning, whereas the same value left unmarked would be
		// redacted by the file-path heuristic - guarding against a regression back to that behavior.
		assert.strictEqual(cleanData(data, [])['ABExp.queriedFeature'], scoped);
		assert.strictEqual(cleanData({ 'ABExp.queriedFeature': scoped }, [])['ABExp.queriedFeature'], '<REDACTED: user-file-path>');
	});
});
