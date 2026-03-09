// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'fs/promises';
import path from 'path';
import { AgentRegistry } from '../src/registry/agentRegistry';

const TEST_DIR = path.join(__dirname, '.test-config');

describe('AgentRegistry', () => {
	test('loads agents from a valid config file', async () => {
		await mkdir(TEST_DIR, { recursive: true });
		const configPath = path.join(TEST_DIR, 'acp-agents.json');

		await writeFile(configPath, JSON.stringify({
			agents: [
				{
					id: 'test-agent',
					name: 'Test Agent',
					transport: 'stdio',
					command: 'echo',
					args: ['hello'],
					capabilities: ['code-generation', 'analysis'],
					contextWindow: 128000,
					costTier: 'free',
				},
				{
					id: 'http-agent',
					name: 'HTTP Agent',
					transport: 'http',
					url: 'http://localhost:4200',
					capabilities: ['security-review'],
					costTier: 'local',
				},
			],
		}));

		const registry = new AgentRegistry(configPath);
		await registry.load();

		const descriptors = registry.listDescriptors();
		assert.deepStrictEqual(descriptors, [
			{
				id: 'test-agent',
				name: 'Test Agent',
				transport: 'stdio',
				capabilities: ['code-generation', 'analysis'],
				contextWindow: 128000,
				costTier: 'free',
			},
			{
				id: 'http-agent',
				name: 'HTTP Agent',
				transport: 'http',
				capabilities: ['security-review'],
				contextWindow: undefined,
				costTier: 'local',
			},
		]);

		assert.ok(registry.has('test-agent'));
		assert.ok(registry.has('http-agent'));
		assert.ok(!registry.has('nonexistent'));

		const entry = registry.getEntry('test-agent');
		assert.equal(entry?.command, 'echo');
		assert.deepStrictEqual(entry?.args, ['hello']);

		await rm(TEST_DIR, { recursive: true, force: true });
	});

	test('handles missing config file gracefully', async () => {
		const registry = new AgentRegistry('/nonexistent/path/acp-agents.json');
		await registry.load(); // Should not throw

		assert.deepStrictEqual(registry.listDescriptors(), []);
	});

	test('validates stdio agent requires command', async () => {
		await mkdir(TEST_DIR, { recursive: true });
		const configPath = path.join(TEST_DIR, 'bad-config.json');

		await writeFile(configPath, JSON.stringify({
			agents: [{
				id: 'bad-agent',
				name: 'Bad Agent',
				transport: 'stdio',
				capabilities: [],
				costTier: 'free',
			}],
		}));

		const registry = new AgentRegistry(configPath);
		await assert.rejects(() => registry.load(), /stdio transport requires a "command"/);

		await rm(TEST_DIR, { recursive: true, force: true });
	});

	test('validates http agent requires url', async () => {
		await mkdir(TEST_DIR, { recursive: true });
		const configPath = path.join(TEST_DIR, 'bad-http.json');

		await writeFile(configPath, JSON.stringify({
			agents: [{
				id: 'bad-http',
				name: 'Bad HTTP',
				transport: 'http',
				capabilities: [],
				costTier: 'free',
			}],
		}));

		const registry = new AgentRegistry(configPath);
		await assert.rejects(() => registry.load(), /http transport requires a "url"/);

		await rm(TEST_DIR, { recursive: true, force: true });
	});

	test('entryToCapabilities returns static capabilities', () => {
		const caps = AgentRegistry.entryToCapabilities({
			id: 'test',
			name: 'Test',
			transport: 'stdio',
			command: 'test',
			capabilities: ['code-generation', 'testing'],
			costTier: 'free',
		});

		assert.deepStrictEqual(caps, {
			agentId: 'test',
			capabilities: ['code-generation', 'testing'],
			supportsPause: false,
			supportsResume: false,
		});
	});
});
