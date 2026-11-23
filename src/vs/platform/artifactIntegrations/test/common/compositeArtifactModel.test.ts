/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ArtifactRun, ArtifactSnapshot, IArtifactModel } from '../../common/artifactIntegration.js';
import { CompositeArtifactModel } from '../../common/compositeArtifactModel.js';

suite('Composite artifact model', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function source(id: string, location: 'host' | 'client', runs: readonly ArtifactRun[] = []) {
		const calls: string[] = [];
		const snapshot = observableValue<ArtifactSnapshot>('snapshot', {
			authority: { id, targetHost: 'vendor-host', location }, session: 'vendor-session://opaque',
			artifact: { id: 'record', label: 'Resource', resource: 'https://example.test/resource' },
			mainIntegrationId: id, runs: runs.slice(0, 50).reverse(),
			contributions: [{
				integrationId: id, label: id, actions: [], options: [], configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
				view: { availability: { kind: 'available' }, main: { label: id, icon: { id: 'link' }, detailsId: 'main' }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] },
			}],
		});
		const model = upcastPartial<IArtifactModel>({
			snapshot,
			invoke: async (_integration, action, chat) => { calls.push(`invoke:${action}:${chat}`); return run(id, 1); },
			configure: async (_integration, revision) => { calls.push(`configure:${revision}`); },
			requestAuthentication: async () => { calls.push('authenticate'); return { resource: 'https://example.test' }; },
			cancel: async id => { calls.push(`cancel:${id}`); },
			reconcile: async id => { calls.push(`reconcile:${id}`); },
			getRuns: async (before, limit = 50) => {
				const start = before ? runs.findIndex(run => run.id === before) + 1 : 0;
				if (before && start === 0) {
					throw new Error('Invalid source cursor');
				}
				const page = runs.slice(start, start + limit);
				return { runs: page, next: start + page.length < runs.length ? page.at(-1)?.id : undefined };
			},
		});
		return { model, snapshot, calls };
	}

	function run(owner: string, createdAt: number): ArtifactRun {
		return {
			id: `${owner}:${createdAt}`, bindingId: owner, integrationId: owner, actionId: 'action', actionKind: 'code', actionConsent: 'consent', source: 'manual',
			requestId: `${createdAt}`, state: 'completed', createdAt, updatedAt: createdAt, reason: 'Done', dispatched: true,
		};
	}

	test('combines reactive presentation while retaining each execution authority', () => {
		const host = source('host', 'host');
		const client = source('extension', 'client');
		const model = new CompositeArtifactModel(host.model, constObservable(client.model));
		const initial = model.snapshot.get();
		host.snapshot.set({ ...host.snapshot.get(), contributions: [], mainIntegrationId: undefined }, undefined);
		assert.deepStrictEqual({
			initial: initial.contributions.map(contribution => [contribution.integrationId, contribution.authority?.location]),
			primary: initial.mainIntegrationId, remaining: model.snapshot.get().mainIntegrationId,
		}, { initial: [['host', 'host'], ['extension', 'client']], primary: 'host', remaining: 'extension' });
	});

	test('routes configuration, authentication, actions, cancellation, and reconciliation to their owner', async () => {
		const host = source('host', 'host');
		const client = source('extension', 'client');
		const model = new CompositeArtifactModel(host.model, constObservable(client.model));
		await model.configure('host', 2, {});
		await model.requestAuthentication('host');
		const run = await model.invoke('extension', 'start', 'vendor-chat://opaque', 'request');
		await model.cancel(run.id);
		await model.reconcile(run.id);
		assert.deepStrictEqual({ host: host.calls, client: client.calls }, {
			host: ['configure:2', 'authenticate'], client: ['invoke:start:vendor-chat://opaque', 'cancel:extension:1', 'reconcile:extension:1'],
		});
	});

	test('pages interleaved histories across source page boundaries without skipping or duplicating runs', async () => {
		const all = Array.from({ length: 450 }, (_, index) => run(index % 2 ? 'host' : 'client', 450 - index));
		const host = source('host', 'host', all.filter(run => run.bindingId === 'host'));
		const client = source('client', 'client', all.filter(run => run.bindingId === 'client'));
		const model = new CompositeArtifactModel(host.model, constObservable(client.model));
		const actual: string[] = [];
		let cursor: string | undefined;
		do {
			const page = await model.getRuns(cursor, 73);
			actual.push(...page.runs.map(run => run.id));
			cursor = page.next;
		} while (cursor);
		await model.cancel(all.at(-1)!.id);
		assert.deepStrictEqual({ ids: actual, cancelled: host.calls }, { ids: all.map(run => run.id), cancelled: ['cancel:host:1'] });
	});

	test('late client contributions do not delay the host model', () => {
		const host = source('host', 'host');
		const client = source('client', 'client');
		const secondary = observableValue<IArtifactModel | undefined>('secondary', undefined);
		const model = new CompositeArtifactModel(host.model, secondary);
		const initial = model.snapshot.get().contributions.map(contribution => contribution.integrationId);
		secondary.set(client.model, undefined);
		assert.deepStrictEqual({
			initial, combined: model.snapshot.get().contributions.map(contribution => contribution.integrationId),
		}, { initial: ['host'], combined: ['host', 'client'] });
	});

	for (const cachedBy of ['invocation', 'history'] as const) {
		test(`replaces cached run owners from ${cachedBy} when the client model reconnects`, async () => {
			const history = [run('client', 1)];
			const host = source('host', 'host');
			const previous = source('client', 'client', history);
			const current = source('client', 'client', history);
			const secondary = observableValue<IArtifactModel | undefined>('secondary', previous.model);
			const model = new CompositeArtifactModel(host.model, secondary);
			if (cachedBy === 'invocation') {
				await model.invoke('client', 'action', 'chat', 'request');
			} else {
				await model.getRuns();
			}
			previous.calls.length = 0;
			secondary.set(current.model, undefined);
			await model.cancel(history[0].id);
			await model.reconcile(history[0].id);
			secondary.set(undefined, undefined);
			await assert.rejects(model.cancel(history[0].id), /not found/);
			assert.deepStrictEqual({ previous: previous.calls, current: current.calls }, {
				previous: [], current: ['cancel:client:1', 'reconcile:client:1'],
			});
		});
	}

	test('live runs retain the newest fifty in chronological order and preserve source order for ties', () => {
		const all = Array.from({ length: 64 }, (_, index) => run(index % 2 ? 'host' : 'client', 64 - index));
		const host = source('host', 'host', all.filter(run => run.bindingId === 'host'));
		const client = source('client', 'client', all.filter(run => run.bindingId === 'client'));
		const model = new CompositeArtifactModel(host.model, constObservable(client.model));
		const chronological = model.snapshot.get().runs.map(run => run.id);
		client.snapshot.set({ ...client.snapshot.get(), runs: [{ ...run('client', 65), id: 'z-first' }, { ...run('client', 65), id: 'a-second' }] }, undefined);
		assert.deepStrictEqual({
			chronological, latest: model.snapshot.get().runs.at(-1)?.id,
		}, { chronological: all.slice(0, 50).reverse().map(run => run.id), latest: 'a-second' });
	});

	test('rejects unknown integration IDs and history cursors', async () => {
		const model = new CompositeArtifactModel(source('host', 'host').model, constObservable(source('client', 'client').model));
		await assert.rejects(model.invoke('missing', 'action', 'chat', 'request'), /Missing/);
		await assert.rejects(model.getRuns('missing'), /cursor/);
		await assert.rejects(model.getRuns(undefined, 201), /page size/);
	});
});
