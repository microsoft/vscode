/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, useFakeTimers } from 'sinon';
import { mainWindow } from '../../../../base/browser/window.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue, waitForState } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { LocalArtifactIntegrationHost } from '../../browser/localArtifactIntegrationHost.js';
import { ArtifactDetails, ArtifactSnapshot, IArtifactModel } from '../../common/artifactIntegration.js';
import { ArtifactIntegrationService } from '../../common/artifactIntegrationService.js';

type LocalChannel = ReturnType<NonNullable<ConstructorParameters<typeof LocalArtifactIntegrationHost>[5]>>;
type LocalMessage = Parameters<LocalChannel['postData']>[0];

class TestChannel extends Disposable implements LocalChannel {
	private readonly emitter = this._register(new Emitter<LocalMessage>());
	readonly onDidReceiveData = this.emitter.event;
	readonly sent: LocalMessage[] = [];
	paused = false;

	constructor(private readonly channels: Set<TestChannel>) {
		super();
		channels.add(this);
		this._register(toDisposable(() => channels.delete(this)));
	}

	postData(message: LocalMessage): void {
		if (!this.paused) {
			this.sent.push(message);
			for (const channel of this.channels) {
				if (channel !== this && !channel.paused) {
					channel.emitter.fire(message);
				}
			}
		}
	}
}

suite('Local artifact integration host', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());

	for (const resumeBy of ['heartbeat', 'request'] as const) {
		test(`restores only the expired client's subscriptions on its next ${resumeBy}`, async () => {
			const clock = useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
			const scope = generateUuid();
			const channels = new Set<TestChannel>();
			const createChannel = () => new TestChannel(channels);
			const snapshot = observableValue<ArtifactSnapshot>('snapshot', {
				authority: { id: 'local', targetHost: 'host', location: 'client' },
				session: 'session', artifact: { id: 'artifact', label: 'Before', resource: 'https://example.test' }, contributions: [], runs: [],
			});
			const details = observableValue<ArtifactDetails>('details', {
				title: 'Before', availability: { kind: 'available' }, links: [], items: [], completeness: 'complete',
			});
			let released = 0;
			let resets = 0;
			let ownerResets = 0;
			const model = upcastPartial<IArtifactModel>({
				snapshot,
				getRuns: async () => ({ runs: [] }),
				acquireDetails: async () => ({ details, dispose() { } }),
			});
			const runtime = new class extends mock<ArtifactIntegrationService>() {
				override async initialize() { }
				override async acquireArtifact() { return { object: model, dispose: () => { released++; } }; }
				override async whenIdle() { }
				override dispose() { }
			}();
			const log = store.add(new NullLogService());
			const owner = store.add(new LocalArtifactIntegrationHost(scope, () => runtime, log, mainWindow.navigator.locks, undefined, createChannel));
			let client: LocalArtifactIntegrationHost | undefined;
			try {
				const ownerReference = store.add(await owner.client.acquireArtifact('session', 'artifact'));
				store.add(owner.onDidReset(() => ownerResets++));
				client = store.add(new LocalArtifactIntegrationHost(scope, () => { throw new Error('Unexpected owner takeover'); }, log, mainWindow.navigator.locks, undefined, createChannel));
				const channel = [...channels].at(-1)!;
				const serverChannel = [...channels][1];
				const reference = store.add(await client.client.acquireArtifact('session', 'artifact'));
				const detailReference = store.add(await reference.object.acquireDetails('test', 'main'));
				const hello = channel.sent.find(message => message.kind === 'hello');
				assert.ok(hello?.kind === 'hello');
				const stale = serverChannel.sent.find(message => message.kind === 'update' && message.client === hello.client && message.update.kind === 'artifact');
				store.add(client.onDidReset(() => resets++));
				channel.paused = true;
				await clock.tickAsync(60_000);
				snapshot.set({ ...snapshot.get(), artifact: { ...snapshot.get().artifact, label: 'After' } }, undefined);
				details.set({ ...details.get(), title: 'After' }, undefined);
				channel.paused = false;
				if (resumeBy === 'heartbeat') {
					await clock.tickAsync(10_000);
				} else {
					await assert.rejects(reference.object.getRuns(), /coordinator changed/);
				}
				assert.strictEqual(resets, 1);
				await waitForState(reference.object.snapshot, value => value.artifact.label === 'After');
				await waitForState(detailReference.details, value => value.title === 'After');
				assert.ok(stale?.kind === 'update' && stale.update.kind === 'artifact');
				serverChannel.postData({
					...stale,
					update: { ...stale.update, revision: 1000, snapshot: { ...snapshot.get(), artifact: { ...snapshot.get().artifact, label: 'Obsolete' } } },
				});
				assert.deepStrictEqual({
					resets, ownerResets, released,
					ownerLabel: ownerReference.object.snapshot.get().artifact.label,
					clientLabel: reference.object.snapshot.get().artifact.label,
					details: detailReference.details.get().title,
					history: (await reference.object.getRuns()).runs,
				}, { resets: 1, ownerResets: 0, released: 1, ownerLabel: 'After', clientLabel: 'After', details: 'After', history: [] });
			} finally {
				client?.dispose();
				owner.dispose();
				await mainWindow.navigator.locks.request(`vscode-artifact-integrations:${scope}`, () => undefined);
				await new Promise<void>((resolve, reject) => {
					const request = mainWindow.indexedDB.deleteDatabase(`vscode-artifact-integrations:${scope}`);
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
				});
			}
		});
	}
});
