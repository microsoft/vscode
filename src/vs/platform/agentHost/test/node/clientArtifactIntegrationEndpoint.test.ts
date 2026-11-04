/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ArtifactSnapshot } from '../../../artifactIntegrations/common/artifactIntegration.js';
import type { IClientArtifactIntegrations } from '../../common/clientArtifactIntegrations.js';
import { ArtifactIntegrationRequest } from '../../../artifactIntegrations/common/artifactIntegrationProtocol.js';
import { RegisterClientArtifactIntegrationsExtensionMethod } from '../../common/agentHostExtensionProtocol.js';
import { ClientArtifactIntegrationEndpoint } from '../../node/artifactIntegrations/clientArtifactIntegrationEndpoint.js';

suite('ClientArtifactIntegrationEndpoint', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const snapshot: ArtifactSnapshot = {
		authority: { id: 'window', targetHost: 'local', location: 'client' }, session: 'copilot:/session',
		artifact: { id: 'experiment', label: 'Experiment', resource: 'https://experiments.test/feature' }, contributions: [], runs: [],
	};

	/** Accepts a window's offer through an endpoint whose requests to the window are settled by `answer`. */
	async function serve(answer: (request: ArtifactIntegrationRequest) => Promise<unknown>) {
		const sent: { readonly kind: ArtifactIntegrationRequest['kind']; readonly timeout: number }[] = [];
		const warnings: string[] = [];
		let registered: IClientArtifactIntegrations | undefined;
		const endpoint = store.add(new ClientArtifactIntegrationEndpoint('window-1', {
			register: (_clientId, integrations) => {
				registered = integrations;
				return toDisposable(() => registered = undefined);
			},
		}, (request, deadline) => {
			sent.push({ kind: request.kind, timeout: deadline });
			return answer(request);
		}, new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}()));
		await endpoint.handleRequest(RegisterClientArtifactIntegrationsExtensionMethod, { integrations: [{ id: 'extension.exp', label: 'ExP', automationOptions: [] }] });
		return { endpoint, sent, warnings, access: registered!.access };
	}

	test('settles releases itself and sends nothing once its connection has ended', async () => {
		const { endpoint, sent, warnings, access } = await serve(async request => request.kind === 'acquire'
			? { kind: 'artifact', subscription: request.subscription, revision: 0, snapshot }
			: { kind: 'ok' });
		const reference = await access.acquireArtifact(snapshot.session, snapshot.artifact.id);
		endpoint.dispose();
		const refused = await Promise.allSettled([
			reference.object.configure('extension.exp', 0, { auto: true }),
			access.acquireArtifact(snapshot.session, snapshot.artifact.id),
		]);
		reference.dispose();
		await timeout(0);

		assert.deepStrictEqual({ sent, warnings, refused: refused.map(result => result.status) }, {
			sent: [{ kind: 'acquire', timeout: 60_000 }],
			warnings: [],
			refused: ['rejected', 'rejected'],
		});
	});

	test('gives up on a window that does not answer in time', () => runWithFakedTimers({}, async () => {
		const { sent, warnings, access } = await serve(request => request.kind === 'release' ? Promise.resolve({ kind: 'ok' }) : new Promise(() => { }));
		const failure = await access.acquireArtifact(snapshot.session, snapshot.artifact.id).then(() => 'acquired', (error: Error) => error.message);

		assert.deepStrictEqual({ failure, sent, warnings }, {
			failure: 'The VS Code window did not respond in time; the outcome of this request is uncertain.',
			sent: [{ kind: 'acquire', timeout: 60_000 }, { kind: 'release', timeout: 60_000 }],
			warnings: [],
		});
	}));
});
