/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { cloneAndChange } from '../../../../../base/common/objects.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcast } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
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

class TestDialogService implements Partial<IDialogService> {
	declare readonly _serviceBrand: undefined;

	private _promptResult: boolean | undefined;
	private _promptSpy: sinon.SinonStub;

	constructor() {
		this._promptSpy = sinon.stub();
		this._promptSpy.callsFake(() => {
			return Promise.resolve({ result: this._promptResult });
		});
	}

	setPromptResult(result: boolean | undefined): void {
		this._promptResult = result;
	}

	get promptSpy(): sinon.SinonStub {
		return this._promptSpy;
	}

	prompt(options: any): Promise<any> {
		return this._promptSpy(options);
	}
}

suite('Workbench - MCP - Registry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let registry: McpRegistry;
	let testStorageService: TestStorageService;
	let testConfigResolverService: TestConfigurationResolverService;
	let testDialogService: TestDialogService;
	let testCollection: McpCollectionDefinition & { serverDefinitions: ISettableObservable<McpServerDefinition[]> };
	let baseDefinition: McpServerDefinition;

	setup(() => {
		testConfigResolverService = new TestConfigurationResolverService();
		testStorageService = store.add(new TestStorageService());
		testDialogService = new TestDialogService();

		const services = new ServiceCollection(
			[IConfigurationResolverService, testConfigResolverService],
			[IStorageService, testStorageService],
			[ISecretStorageService, new TestSecretStorageService()],
			[ILoggerService, store.add(new TestLoggerService())],
			[IOutputService, upcast({ showChannel: () => { } })],
			[IDialogService, testDialogService]
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

	test('resolveConnection creates connection with resolved variables and memorizes them until cleared', async () => {
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

		const delegate = new TestMcpHostDelegate();
		store.add(registry.registerDelegate(delegate));
		testCollection.serverDefinitions.set([definition], undefined);
		store.add(registry.registerCollection(testCollection));

		const connection = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition }) as McpServerConnection;

		assert.ok(connection);
		assert.strictEqual(connection.definition, definition);
		assert.strictEqual((connection.launchDefinition as any).command, '/test/workspace/cmd');
		assert.strictEqual((connection.launchDefinition as any).env.PATH, 'interactiveValue0');
		connection.dispose();

		const connection2 = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition }) as McpServerConnection;

		assert.ok(connection2);
		assert.strictEqual((connection2.launchDefinition as any).env.PATH, 'interactiveValue0');
		connection2.dispose();

		registry.clearSavedInputs();

		const connection3 = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition }) as McpServerConnection;

		assert.ok(connection3);
		assert.strictEqual((connection3.launchDefinition as any).env.PATH, 'interactiveValue4');
		connection3.dispose();
	});

	suite('Trust Management', () => {
		setup(() => {
			const delegate = new TestMcpHostDelegate();
			store.add(registry.registerDelegate(delegate));
		});

		test('resolveConnection connects to server when trusted by default', async () => {
			const definition = { ...baseDefinition };
			store.add(registry.registerCollection(testCollection));
			testCollection.serverDefinitions.set([definition], undefined);

			const connection = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition });

			assert.ok(connection);
			assert.strictEqual(testDialogService.promptSpy.called, false);
			connection?.dispose();
		});

		test('resolveConnection prompts for confirmation when not trusted by default', async () => {
			const untrustedCollection: McpCollectionDefinition = {
				...testCollection,
				isTrustedByDefault: false
			};

			const definition = { ...baseDefinition };
			store.add(registry.registerCollection(untrustedCollection));
			testCollection.serverDefinitions.set([definition], undefined);

			testDialogService.setPromptResult(true);

			const connection = await registry.resolveConnection({
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.ok(connection);
			assert.strictEqual(testDialogService.promptSpy.called, true);
			connection?.dispose();

			testDialogService.promptSpy.resetHistory();
			const connection2 = await registry.resolveConnection({
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.ok(connection2);
			assert.strictEqual(testDialogService.promptSpy.called, false);
			connection2?.dispose();
		});

		test('resolveConnection returns undefined when user does not trust the server', async () => {
			const untrustedCollection: McpCollectionDefinition = {
				...testCollection,
				isTrustedByDefault: false
			};

			const definition = { ...baseDefinition };
			store.add(registry.registerCollection(untrustedCollection));
			testCollection.serverDefinitions.set([definition], undefined);

			testDialogService.setPromptResult(false);

			const connection = await registry.resolveConnection({
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.strictEqual(connection, undefined);
			assert.strictEqual(testDialogService.promptSpy.called, true);

			testDialogService.promptSpy.resetHistory();
			const connection2 = await registry.resolveConnection({
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.strictEqual(connection2, undefined);
			assert.strictEqual(testDialogService.promptSpy.called, false);
		});

		test('resolveConnection honors forceTrust parameter', async () => {
			const untrustedCollection: McpCollectionDefinition = {
				...testCollection,
				isTrustedByDefault: false
			};

			const definition = { ...baseDefinition };
			store.add(registry.registerCollection(untrustedCollection));
			testCollection.serverDefinitions.set([definition], undefined);

			testDialogService.setPromptResult(false);

			const connection1 = await registry.resolveConnection({
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.strictEqual(connection1, undefined);

			testDialogService.promptSpy.resetHistory();
			testDialogService.setPromptResult(true);

			const connection2 = await registry.resolveConnection({
				collectionRef: untrustedCollection,
				definitionRef: definition,
				forceTrust: true
			});

			assert.ok(connection2);
			assert.strictEqual(testDialogService.promptSpy.called, true);
			connection2?.dispose();

			testDialogService.promptSpy.resetHistory();
			const connection3 = await registry.resolveConnection({
				collectionRef: untrustedCollection,
				definitionRef: definition
			});

			assert.ok(connection3);
			assert.strictEqual(testDialogService.promptSpy.called, false);
			connection3?.dispose();
		});
	});
});
