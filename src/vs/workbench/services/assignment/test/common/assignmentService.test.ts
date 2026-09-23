/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ExperimentationService as TASClient } from 'tas-client';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { cleanData, NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
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
