/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { MockAgent } from './mockAgent.js';

suite('AgentHostAuthenticationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks accepted token generations without changing authenticate behavior', async () => {
		const service = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
		const agent = new MockAgent();
		disposables.add(toDisposable(() => agent.dispose()));
		agent.getProtectedResources = () => [{
			resource: 'https://api.github.com',
			authorization_servers: ['https://github.com/login/oauth'],
			required: true,
		}];
		const changes: { generation: number; kind: string }[] = [];
		disposables.add(service.onDidChangeToken(event => changes.push({ generation: event.generation, kind: event.kind })));

		const first = await service.authenticate({ resource: 'https://api.github.com', scopes: ['repo'], token: 'one' }, [agent]);
		const duplicate = await service.authenticate({ resource: 'https://api.github.com', scopes: ['repo'], token: 'one' }, [agent]);
		const replacement = await service.authenticate({ resource: 'https://api.github.com', scopes: ['repo'], token: 'two' }, [agent]);
		const resolved = service.getAuthTokenWithGeneration({ resource: 'https://api.github.com', scopes: ['repo'] });

		assert.deepStrictEqual({ first, duplicate, replacement, resolved, changes }, {
			first: { authenticated: true },
			duplicate: { authenticated: true },
			replacement: { authenticated: true },
			resolved: { token: 'two', generation: 2 },
			changes: [
				{ generation: 1, kind: 'accepted' },
				{ generation: 2, kind: 'accepted' },
			],
		});
	});

	test('invalidates only the matching current generation', async () => {
		const service = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
		const agent = new MockAgent();
		disposables.add(toDisposable(() => agent.dispose()));
		agent.getProtectedResources = () => [{
			resource: 'https://api.github.com',
			authorization_servers: ['https://github.com/login/oauth'],
			required: true,
		}];
		const request = { resource: 'https://api.github.com', scopes: ['repo'] };
		await service.authenticate({ ...request, token: 'one' }, [agent]);
		await service.authenticate({ ...request, token: 'two' }, [agent]);

		service.invalidateAuthToken(request, 1);
		const afterStaleInvalidation = service.getAuthToken(request);
		service.invalidateAuthToken(request, 2);

		assert.deepStrictEqual({
			afterStaleInvalidation,
			afterCurrentInvalidation: service.getAuthToken(request),
		}, {
			afterStaleInvalidation: 'two',
			afterCurrentInvalidation: undefined,
		});
	});

	test('invalidating a scoped credential removes the same legacy fallback token', async () => {
		const service = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
		const agent = new MockAgent();
		disposables.add(toDisposable(() => agent.dispose()));
		agent.getProtectedResources = () => [{
			resource: 'https://api.github.com',
			authorization_servers: ['https://github.com/login/oauth'],
			required: true,
		}];
		await service.authenticate({ resource: 'https://api.github.com', token: 'same' }, [agent]);
		await service.authenticate({ resource: 'https://api.github.com', scopes: ['repo'], token: 'same' }, [agent]);
		const scoped = service.getAuthTokenWithGeneration({ resource: 'https://api.github.com', scopes: ['repo'] });

		service.invalidateAuthToken({ resource: 'https://api.github.com', scopes: ['repo'] }, scoped!.generation);

		assert.deepStrictEqual({
			scoped: service.getAuthToken({ resource: 'https://api.github.com', scopes: ['repo'] }),
			legacy: service.getAuthToken({ resource: 'https://api.github.com' }),
		}, {
			scoped: undefined,
			legacy: undefined,
		});
	});
});
