/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { IAgent } from '../../../common/agent.js';
import { AcpAgent } from '../../../node/acp/acpAgent.js';
import { registerConfiguredAcpAgents, validateAcpAgentConfigs } from '../../../node/acp/acpAgentRegistration.js';

suite('ACP agent registration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const log = new NullLogService();

	test('keeps well-formed entries and drops malformed or duplicate ones', () => {
		assert.deepStrictEqual(validateAcpAgentConfigs([
			{ id: 'qwen', displayName: 'Qwen Code', command: 'qwen', args: ['--acp'] },
			{ id: 'Bad Id', command: 'x' },
			{ id: 'nocmd', command: '  ' },
			{ id: 'badargs', command: 'x', args: [1] },
			{ id: 'badenv', command: 'x', env: { A: 1 } },
			{ id: 'qwen', command: 'other' },
			{ id: 'opencode', command: 'opencode', args: ['acp'], env: { OPENCODE_LOG: 'warn' } },
		], log), [
			{ id: 'qwen', displayName: 'Qwen Code', command: 'qwen', args: ['--acp'] },
			{ id: 'opencode', command: 'opencode', args: ['acp'], env: { OPENCODE_LOG: 'warn' } },
		]);
		assert.deepStrictEqual(validateAcpAgentConfigs(undefined, log), []);
		assert.deepStrictEqual(validateAcpAgentConfigs({ id: 'qwen' }, log), []);
	});

	test('registers configured agents once and picks up additions', () => {
		const onDidRootConfigChange = new Emitter<void>();
		let enabled: unknown = false;
		let configured: unknown = [{ id: 'qwen', command: 'qwen', args: ['--acp'] }];
		const providers = new Map<string, IAgent>();
		const providerService = {
			registerProvider: (agent: IAgent) => { providers.set(agent.id, agent); },
			getProvider: (id: string) => providers.get(id),
		};
		const instantiationService = {
			createInstance: ((ctor: typeof AcpAgent, ...args: ConstructorParameters<typeof AcpAgent>) => new ctor(args[0], args[1], log)) as never,
		};
		const getRootValue = (_schema: unknown, key: string) => key === 'acpAgentEnabled' ? enabled : configured;
		const listener = registerConfiguredAcpAgents(providerService, { getRootValue: getRootValue as never, onDidRootConfigChange: onDidRootConfigChange.event }, instantiationService, log);

		// Gated by the policy-aware `acpAgentEnabled` root key.
		assert.deepStrictEqual([...providers.keys()], []);
		enabled = true;
		onDidRootConfigChange.fire();
		assert.deepStrictEqual([...providers.keys()], ['acp-qwen']);
		onDidRootConfigChange.fire();
		assert.deepStrictEqual([...providers.keys()], ['acp-qwen']);

		configured = [{ id: 'qwen', command: 'qwen', args: ['--acp'] }, { id: 'opencode', command: 'opencode', args: ['acp'] }];
		onDidRootConfigChange.fire();
		assert.deepStrictEqual([...providers.keys()], ['acp-qwen', 'acp-opencode']);

		listener.dispose();
		onDidRootConfigChange.dispose();
		for (const provider of providers.values()) {
			provider.dispose();
		}
	});
});
