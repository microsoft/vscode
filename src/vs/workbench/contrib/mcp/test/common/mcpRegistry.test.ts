/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { cloneAndChange } from '../../../../../base/common/objects.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { upcast } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { TestLoggerService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { McpRegistry } from '../../common/mcpRegistry.js';
import { IMcpHostDelegate, IMcpMessageTransport } from '../../common/mcpRegistryTypes.js';
import { McpServerConnection } from '../../common/mcpServerConnection.js';
import { McpCollectionDefinition, McpServerDefinition, McpServerTransportType } from '../../common/mcpTypes.js';
import { TestMcpMessageTransport } from './mcpRegistryTypes.js';

class TestConfigurationResolverService implements Partial<IConfigurationResolverService> {
	declare readonly _serviceBrand: undefined;

	private interactiveCounter = 0;

	// Used to simulate stored/resolved variables
	private readonly resolvedVariables = new Map<string, string>();

	constructor() {
		// Add some test variables
		this.resolvedVariables.set('workspaceFolder', '/test/workspace');
		this.resolvedVariables.set('fileBasename', 'test.txt');
	}

	resolveAsync(folder: any, value: any): Promise<any> {
		if (typeof value === 'string') {
			return Promise.resolve(this.replaceVariables(value));
		} else if (Array.isArray(value)) {
			return Promise.resolve(value.map(v => typeof v === 'string' ? this.replaceVariables(v) : v));
		} else {
			const result: Record<string, any> = {};
			for (const key in value) {
				if (typeof value[key] === 'string') {
					result[key] = this.replaceVariables(value[key]);
				} else {
					result[key] = value[key];
				}
			}
			return Promise.resolve(result);
		}
	}

	private replaceVariables(value: string): string {
		let result = value;
		for (const [key, val] of this.resolvedVariables.entries()) {
			result = result.replace(`\${${key}}`, val);
		}
		return result;
	}

	resolveAnyAsync(folder: any, config: any, commandValueMapping?: Record<string, string>): Promise<any> {
		// Use cloneAndChange to recursively replace variables in the config
		const newConfig = cloneAndChange(config, (value) => {
			if (typeof value === 'string') {
				// Replace any ${variable} with its value
				let result = value;
				for (const [key, val] of this.resolvedVariables.entries()) {
					result = result.replace(`\${${key}}`, val);
				}

				// If a commandValueMapping is provided, use it for additional replacements
				if (commandValueMapping) {
					for (const [key, val] of Object.entries(commandValueMapping)) {
						result = result.replace(`\${${key}}`, val);
					}
				}

				return result === value ? undefined : result;
			}
			return undefined;
		});

		return Promise.resolve(newConfig);
	}

	resolveWithInteraction(folder: any, config: any, section?: string, variables?: Record<string, string>, target?: ConfigurationTarget): Promise<Map<string, string> | undefined> {
		// For testing, we simulate interaction by returning a map with some variables
		const result = new Map<string, string>();
		result.set('input:testInteractive', `interactiveValue${this.interactiveCounter++}`);
		result.set('command:testCommand', `commandOutput${this.interactiveCounter++}}`);

		// If variables are provided, include those too
		if (variables) {
			Object.entries(variables).forEach(([key, value]) => {
				result.set(key, value);
			});
		}

		return Promise.resolve(result);
	}
}

class TestMcpHostDelegate implements IMcpHostDelegate {
	canStart(): boolean {
		return true;
	}

	start(): IMcpMessageTransport {
		return new TestMcpMessageTransport();
	}
}

suite('Workbench - MCP - Registry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let registry: McpRegistry;
	let testStorageService: TestStorageService;
	let testConfigResolverService: TestConfigurationResolverService;
	let testCollection: McpCollectionDefinition;
	let baseDefinition: McpServerDefinition;

	setup(() => {
		testConfigResolverService = new TestConfigurationResolverService();
		testStorageService = store.add(new TestStorageService());

		const services = new ServiceCollection(
			[IConfigurationResolverService, testConfigResolverService],
			[IStorageService, testStorageService],
			[ILoggerService, store.add(new TestLoggerService())],
			[IOutputService, upcast({ showChannel: () => { } })],
		);

		const instaService = store.add(new TestInstantiationService(services));
		registry = store.add(instaService.createInstance(McpRegistry));

		// Create test collection that can be reused
		testCollection = {
			id: 'test-collection',
			label: 'Test Collection',
			remoteAuthority: null,
			serverDefinitions: observableValue('serverDefs', []),
			isTrustedByDefault: true,
			scope: StorageScope.APPLICATION
		};

		// Create base definition that can be reused
		baseDefinition = {
			id: 'test-server',
			label: 'Test Server',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'test-command',
				args: [],
				env: {},
				cwd: URI.parse('file:///test')
			}
		};
	});

	test('registerCollection adds collection to registry', () => {
		const disposable = registry.registerCollection(testCollection);
		store.add(disposable);

		assert.strictEqual(registry.collections.get().length, 1);
		assert.strictEqual(registry.collections.get()[0], testCollection);

		disposable.dispose();
		assert.strictEqual(registry.collections.get().length, 0);
	});

	test('registerDelegate adds delegate to registry', () => {
		const delegate = new TestMcpHostDelegate();
		const disposable = registry.registerDelegate(delegate);
		store.add(disposable);

		assert.strictEqual(registry.delegates.length, 1);
		assert.strictEqual(registry.delegates[0], delegate);

		disposable.dispose();
		assert.strictEqual(registry.delegates.length, 0);
	});

	test('hasSavedInputs returns false when no inputs are saved', () => {
		assert.strictEqual(registry.hasSavedInputs(testCollection, baseDefinition), false);
	});

	test('clearSavedInputs removes stored inputs', () => {
		const definition: McpServerDefinition = {
			...baseDefinition,
			variableReplacement: {
				section: 'mcp'
			}
		};

		// Save some mock inputs
		const key = `mcpConfig.${testCollection.id}.${definition.id}`;
		testStorageService.store(key, JSON.stringify({ 'input:foo': 'bar' }), StorageScope.APPLICATION, StorageTarget.MACHINE);

		assert.strictEqual(registry.hasSavedInputs(testCollection, definition), true);
		registry.clearSavedInputs(testCollection, definition);
		assert.strictEqual(registry.hasSavedInputs(testCollection, definition), false);
	});

	test('resolveConnection creates connection with resolved variables and memorizes them', async () => {
		const definition: McpServerDefinition = {
			...baseDefinition,
			launch: {
				type: McpServerTransportType.Stdio,
				command: '${workspaceFolder}/cmd',
				args: ['--file', '${fileBasename}'],
				env: {
					PATH: '${input:testInteractive}'
				},
				cwd: URI.parse('file:///test')
			},
			variableReplacement: {
				section: 'mcp'
			}
		};

		// Register a delegate that can handle the connection
		const delegate = new TestMcpHostDelegate();
		const disposable = registry.registerDelegate(delegate);
		store.add(disposable);

		const connection = await registry.resolveConnection(testCollection, definition) as McpServerConnection;

		assert.ok(connection);
		assert.strictEqual(connection.definition, definition);
		assert.strictEqual((connection.launchDefinition as any).command, '/test/workspace/cmd');
		assert.strictEqual((connection.launchDefinition as any).env.PATH, 'interactiveValue0');
		connection.dispose();

		const connection2 = await registry.resolveConnection(testCollection, definition) as McpServerConnection;

		assert.ok(connection2);
		assert.strictEqual((connection2.launchDefinition as any).env.PATH, 'interactiveValue0');
		connection2.dispose();
	});

	test('resolveConnection with stored variables resolves them', async () => {
		const definition: McpServerDefinition = {
			...baseDefinition,
			launch: {
				type: McpServerTransportType.Stdio,
				command: '${storedVar}',
				args: [],
				env: {},
				cwd: URI.parse('file:///test')
			},
			variableReplacement: {
				section: 'mcp'
			}
		};

		// Save some mock inputs
		const key = `mcpConfig.${testCollection.id}.${definition.id}`;
		testStorageService.store(key, { 'storedVar': 'resolved-value' }, StorageScope.APPLICATION, StorageTarget.MACHINE);

		// Register a delegate that can handle the connection
		const delegate = new TestMcpHostDelegate();
		const disposable = registry.registerDelegate(delegate);
		store.add(disposable);

		const connection = await registry.resolveConnection(testCollection, definition) as McpServerConnection;

		assert.ok(connection);
		assert.strictEqual((connection.launchDefinition as any).command, 'resolved-value');
		connection.dispose();
	});
});
