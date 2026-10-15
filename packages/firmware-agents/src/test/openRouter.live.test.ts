/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { NodeAgentHost } from '../adapters/node/nodeAgentHost';
import { Agent, AgentProfile } from '../kernel/agent';
import { defineTool } from '../kernel/tool';
import { ToolRegistry } from '../kernel/toolRegistry';
import { createOpenRouterClient, openRouterOptionsFromEnv } from '../llm/openRouter';

/**
 * @llm — talks to the real model. Runs only when OPENROUTER_API_KEY and OPENROUTER_MODEL are set,
 * so CI and offline runs skip it.
 */
suite('@llm OpenRouter live', function () {

	const env = openRouterOptionsFromEnv(process.env);

	test('a real model calls a tool and uses its result', async function () {
		if (!env) {
			this.skip();
		}
		this.timeout(120_000);

		let called = 0;
		const registry = new ToolRegistry();
		registry.register(defineTool({
			name: 'read_register',
			description: 'Read a 32-bit core register of the halted target. Returns its value as a hex string.',
			risk: 'read',
			inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Register name, e.g. PC or SP' } }, required: ['name'] },
			invoke: async (input: { name: string }) => {
				called++;
				return { name: input.name, value: input.name.toUpperCase() === 'PC' ? '0x08000F3C' : '0x00000000' };
			},
		}));

		class LiveAgent extends Agent {
			protected readonly profile: AgentProfile = { id: 'live', systemPrompt: 'You are a firmware debugging assistant. Use tools to answer; never guess register values.', maxSteps: 4 };
		}
		const host = new NodeAgentHost({ root: process.cwd(), secrets: [env!.apiKey], write: () => { } });
		const client = createOpenRouterClient({ ...env!, appName: 'RoboAgent firmware-agents tests', temperature: 0 });
		const result = await new LiveAgent(client, registry, host).run('What is the value of the PC register right now? Reply with just the hex value.');

		assert.ok(called >= 1, 'the model should call read_register');
		assert.match(result.text, /0x0?8000F3C/i);
	});
});
