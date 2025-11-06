/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AbstractCommonMcpManagementService } from '../../common/mcpManagementService.js';
import { IGalleryMcpServer, IGalleryMcpServerConfiguration, IInstallableMcpServer, ILocalMcpServer, InstallOptions, RegistryType, TransportType, UninstallOptions } from '../../common/mcpManagement.js';
import { McpServerType, McpServerVariableType, IMcpServerVariable } from '../../common/mcpPlatformTypes.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { NullLogService } from '../../../log/common/log.js';

class TestMcpManagementService extends AbstractCommonMcpManagementService {

	override onInstallMcpServer = Event.None;
	override onDidInstallMcpServers = Event.None;
	override onDidUpdateMcpServers = Event.None;
	override onUninstallMcpServer = Event.None;
	override onDidUninstallMcpServer = Event.None;

	override getInstalled(mcpResource?: URI): Promise<ILocalMcpServer[]> {
		throw new Error('Method not implemented.');
	}
	override install(server: IInstallableMcpServer, options?: InstallOptions): Promise<ILocalMcpServer> {
		throw new Error('Method not implemented.');
	}
	override installFromGallery(server: IGalleryMcpServer, options?: InstallOptions): Promise<ILocalMcpServer> {
		throw new Error('Method not implemented.');
	}
	override updateMetadata(local: ILocalMcpServer, server: IGalleryMcpServer, profileLocation?: URI): Promise<ILocalMcpServer> {
		throw new Error('Method not implemented.');
	}
	override uninstall(server: ILocalMcpServer, options?: UninstallOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}

	override canInstall(server: IGalleryMcpServer | IInstallableMcpServer): true | IMarkdownString {
		throw new Error('Not supported');
	}
}

suite('McpManagementService - getMcpServerConfigurationFromManifest', () => {
	let service: TestMcpManagementService;

	setup(() => {
		service = new TestMcpManagementService(new NullLogService());
	});

	teardown(() => {
		service.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('NPM Package Tests', () => {
		test('basic NPM package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					registryBaseUrl: 'https://registry.npmjs.org',
					identifier: '@modelcontextprotocol/server-brave-search',
					transport: { type: TransportType.STDIO },
					version: '1.0.2',
					environmentVariables: [{
						name: 'BRAVE_API_KEY',
						value: 'test-key'
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.mcpServerConfiguration.config.command, 'npx');
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['@modelcontextprotocol/server-brave-search@1.0.2']);
				assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'BRAVE_API_KEY': 'test-key' });
			}
			assert.strictEqual(result.mcpServerConfiguration.inputs, undefined);
		});

		test('NPM package without version', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					registryBaseUrl: 'https://registry.npmjs.org',
					identifier: '@modelcontextprotocol/everything',
					version: '',
					transport: { type: TransportType.STDIO }
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.mcpServerConfiguration.config.command, 'npx');
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['@modelcontextprotocol/everything']);
			}
		});

		test('NPM package with environment variables containing variables', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					transport: { type: TransportType.STDIO },
					identifier: 'test-server',
					version: '1.0.0',
					environmentVariables: [{
						name: 'API_KEY',
						value: 'key-{api_token}',
						variables: {
							api_token: {
								description: 'Your API token',
								isSecret: true,
								isRequired: true
							}
						}
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'API_KEY': 'key-${input:api_token}' });
			}
			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'api_token');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PROMPT);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, 'Your API token');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
		});

		test('environment variable with empty value should create input variable (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					transport: { type: TransportType.STDIO },
					identifier: '@modelcontextprotocol/server-brave-search',
					version: '1.0.2',
					environmentVariables: [{
						name: 'BRAVE_API_KEY',
						value: '', // Empty value should create input variable
						description: 'Brave Search API Key',
						isRequired: true,
						isSecret: true
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			// BUG: Currently this creates env with empty string instead of input variable
			// Should create an input variable since no meaningful value is provided
			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'BRAVE_API_KEY');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, 'Brave Search API Key');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PROMPT);

			// Environment should use input variable interpolation
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'BRAVE_API_KEY': '${input:BRAVE_API_KEY}' });
			}
		});

		test('environment variable with choices but empty value should create pick input (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					transport: { type: TransportType.STDIO },
					identifier: 'test-server',
					version: '1.0.0',
					environmentVariables: [{
						name: 'SSL_MODE',
						value: '', // Empty value should create input variable
						description: 'SSL connection mode',
						default: 'prefer',
						choices: ['disable', 'prefer', 'require']
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			// BUG: Currently this creates env with empty string instead of input variable
			// Should create a pick input variable since choices are provided
			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'SSL_MODE');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, 'SSL connection mode');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].default, 'prefer');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PICK);
			assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ['disable', 'prefer', 'require']);

			// Environment should use input variable interpolation
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'SSL_MODE': '${input:SSL_MODE}' });
			}
		});

		test('NPM package with package arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					transport: { type: TransportType.STDIO },
					identifier: 'snyk',
					version: '1.1298.0',
					packageArguments: [
						{ type: 'positional', value: 'mcp', valueHint: 'command', isRepeated: false },
						{
							type: 'named',
							name: '-t',
							value: 'stdio',
							isRepeated: false
						}
					]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['snyk@1.1298.0', 'mcp', '-t', 'stdio']);
			}
		});
	});

	suite('Python Package Tests', () => {
		test('basic Python package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.PYTHON,
					transport: { type: TransportType.STDIO },
					registryBaseUrl: 'https://pypi.org',
					identifier: 'weather-mcp-server',
					version: '0.5.0',
					environmentVariables: [{
						name: 'WEATHER_API_KEY',
						value: 'test-key'
					}, {
						name: 'WEATHER_UNITS',
						value: 'celsius'
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.mcpServerConfiguration.config.command, 'uvx');
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['weather-mcp-server==0.5.0']);
				assert.deepStrictEqual(result.mcpServerConfiguration.config.env, {
					'WEATHER_API_KEY': 'test-key',
					'WEATHER_UNITS': 'celsius'
				});
			}
		});

		test('Python package without version', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.PYTHON,
					transport: { type: TransportType.STDIO },
					identifier: 'weather-mcp-server',
					version: ''
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['weather-mcp-server']);
			}
		});
	});

	suite('Docker Package Tests', () => {
		test('basic Docker package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.DOCKER,
					transport: { type: TransportType.STDIO },
					registryBaseUrl: 'https://docker.io',
					identifier: 'mcp/filesystem',
					version: '1.0.2',
					runtimeArguments: [{
						type: 'named',
						name: '--mount',
						value: 'type=bind,src=/host/path,dst=/container/path',
						isRepeated: false
					}],
					environmentVariables: [{
						name: 'LOG_LEVEL',
						value: 'info'
					}],
					packageArguments: [{
						type: 'positional',
						value: '/project',
						valueHint: 'directory',
						isRepeated: false
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.mcpServerConfiguration.config.command, 'docker');
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
					'run', '-i', '--rm',
					'--mount', 'type=bind,src=/host/path,dst=/container/path',
					'-e', 'LOG_LEVEL',
					'mcp/filesystem:1.0.2',
					'/project'
				]);
				assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'LOG_LEVEL': 'info' });
			}
		});

		test('Docker package with variables in runtime arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.DOCKER,
					transport: { type: TransportType.STDIO },
					identifier: 'example/database-manager-mcp',
					version: '3.1.0',
					runtimeArguments: [{
						type: 'named',
						name: '-e',
						value: 'DB_TYPE={db_type}',
						isRepeated: false,
						variables: {
							db_type: {
								description: 'Type of database',
								choices: ['postgres', 'mysql', 'mongodb', 'redis'],
								isRequired: true
							}
						}
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
					'run', '-i', '--rm',
					'-e', 'DB_TYPE=${input:db_type}',
					'example/database-manager-mcp:3.1.0'
				]);
			}
			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'db_type');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PICK);
			assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ['postgres', 'mysql', 'mongodb', 'redis']);
		});

		test('Docker package arguments without values should create input variables (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.DOCKER,
					transport: { type: TransportType.STDIO },
					identifier: 'example/database-manager-mcp',
					version: '3.1.0',
					packageArguments: [{
						type: 'named',
						name: '--host',
						description: 'Database host',
						default: 'localhost',
						isRequired: true,
						isRepeated: false
						// Note: No 'value' field - should create input variable
					}, {
						type: 'positional',
						valueHint: 'database_name',
						description: 'Name of the database to connect to',
						isRequired: true,
						isRepeated: false
						// Note: No 'value' field - should create input variable
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);

			// BUG: Currently named args without value are ignored, positional uses value_hint as literal
			// Should create input variables for both arguments
			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);

			const hostInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'host');
			assert.strictEqual(hostInput?.description, 'Database host');
			assert.strictEqual(hostInput?.default, 'localhost');
			assert.strictEqual(hostInput?.type, McpServerVariableType.PROMPT);

			const dbNameInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'database_name');
			assert.strictEqual(dbNameInput?.description, 'Name of the database to connect to');
			assert.strictEqual(dbNameInput?.type, McpServerVariableType.PROMPT);

			// Args should use input variable interpolation
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
					'run', '-i', '--rm',
					'example/database-manager-mcp:3.1.0',
					'--host', '${input:host}',
					'${input:database_name}'
				]);
			}
		});

		test('Docker Hub backward compatibility', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.DOCKER,
					identifier: 'example/test-image',
					transport: { type: TransportType.STDIO },
					version: '1.0.0'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.mcpServerConfiguration.config.command, 'docker');
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
					'run', '-i', '--rm',
					'example/test-image:1.0.0'
				]);
			}
		});
	});

	suite('NuGet Package Tests', () => {
		test('basic NuGet package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NUGET,
					transport: { type: TransportType.STDIO },
					registryBaseUrl: 'https://api.nuget.org',
					identifier: 'Knapcode.SampleMcpServer',
					version: '0.5.0',
					environmentVariables: [{
						name: 'WEATHER_CHOICES',
						value: 'sunny,cloudy,rainy'
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NUGET);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.mcpServerConfiguration.config.command, 'dnx');
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['Knapcode.SampleMcpServer@0.5.0', '--yes']);
				assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'WEATHER_CHOICES': 'sunny,cloudy,rainy' });
			}
		});

		test('NuGet package with package arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NUGET,
					transport: { type: TransportType.STDIO },
					identifier: 'Knapcode.SampleMcpServer',
					version: '0.4.0-beta',
					packageArguments: [{
						type: 'positional',
						value: 'mcp',
						valueHint: 'command',
						isRepeated: false
					}, {
						type: 'positional',
						value: 'start',
						valueHint: 'action',
						isRepeated: false
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NUGET);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
					'Knapcode.SampleMcpServer@0.4.0-beta',
					'--yes',
					'--',
					'mcp',
					'start'
				]);
			}
		});
	});

	suite('Remote Server Tests', () => {
		test('SSE remote server configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				remotes: [{
					type: TransportType.SSE,
					url: 'http://mcp-fs.anonymous.modelcontextprotocol.io/sse'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
			if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
				assert.strictEqual(result.mcpServerConfiguration.config.url, 'http://mcp-fs.anonymous.modelcontextprotocol.io/sse');
				assert.strictEqual(result.mcpServerConfiguration.config.headers, undefined);
			}
		});

		test('SSE remote server with headers and variables', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				remotes: [{
					type: TransportType.SSE,
					url: 'https://mcp.anonymous.modelcontextprotocol.io/sse',
					headers: [{
						name: 'X-API-Key',
						value: '{api_key}',
						variables: {
							api_key: {
								description: 'API key for authentication',
								isRequired: true,
								isSecret: true
							}
						}
					}, {
						name: 'X-Region',
						value: 'us-east-1'
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
			if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.headers, {
					'X-API-Key': '${input:api_key}',
					'X-Region': 'us-east-1'
				});
			}
			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'api_key');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
		});

		test('streamable HTTP remote server', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				remotes: [{
					type: TransportType.STREAMABLE_HTTP,
					url: 'https://mcp.anonymous.modelcontextprotocol.io/http'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
			if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
				assert.strictEqual(result.mcpServerConfiguration.config.url, 'https://mcp.anonymous.modelcontextprotocol.io/http');
			}
		});

		test('remote headers without values should create input variables', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				remotes: [{
					type: TransportType.SSE,
					url: 'https://api.example.com/mcp',
					headers: [{
						name: 'Authorization',
						description: 'API token for authentication',
						isSecret: true,
						isRequired: true
						// Note: No 'value' field - should create input variable
					}, {
						name: 'X-Custom-Header',
						description: 'Custom header value',
						default: 'default-value',
						choices: ['option1', 'option2', 'option3']
						// Note: No 'value' field - should create input variable with choices
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
			if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
				assert.strictEqual(result.mcpServerConfiguration.config.url, 'https://api.example.com/mcp');
				assert.deepStrictEqual(result.mcpServerConfiguration.config.headers, {
					'Authorization': '${input:Authorization}',
					'X-Custom-Header': '${input:X-Custom-Header}'
				});
			}

			// Should create input variables for headers without values
			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);

			const authInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'Authorization');
			assert.strictEqual(authInput?.description, 'API token for authentication');
			assert.strictEqual(authInput?.password, true);
			assert.strictEqual(authInput?.type, McpServerVariableType.PROMPT);

			const customInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'X-Custom-Header');
			assert.strictEqual(customInput?.description, 'Custom header value');
			assert.strictEqual(customInput?.default, 'default-value');
			assert.strictEqual(customInput?.type, McpServerVariableType.PICK);
			assert.deepStrictEqual(customInput?.options, ['option1', 'option2', 'option3']);
		});
	});

	suite('Variable Interpolation Tests', () => {
		test('multiple variables in single value', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
					transport: { type: TransportType.STDIO },
					version: '1.0.0',
					environmentVariables: [{
						name: 'CONNECTION_STRING',
						value: 'server={host};port={port};database={db_name}',
						variables: {
							host: {
								description: 'Database host',
								default: 'localhost'
							},
							port: {
								description: 'Database port',
								format: 'number',
								default: '5432'
							},
							db_name: {
								description: 'Database name',
								isRequired: true
							}
						}
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.env, {
					'CONNECTION_STRING': 'server=${input:host};port=${input:port};database=${input:db_name}'
				});
			}
			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 3);

			const hostInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'host');
			assert.strictEqual(hostInput?.default, 'localhost');
			assert.strictEqual(hostInput?.type, McpServerVariableType.PROMPT);

			const portInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'port');
			assert.strictEqual(portInput?.default, '5432');

			const dbNameInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'db_name');
			assert.strictEqual(dbNameInput?.description, 'Database name');
		});

		test('variable with choices creates pick input', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
					transport: { type: TransportType.STDIO },
					version: '1.0.0',
					runtimeArguments: [{
						type: 'named',
						name: '--log-level',
						value: '{level}',
						isRepeated: false,
						variables: {
							level: {
								description: 'Log level',
								choices: ['debug', 'info', 'warn', 'error'],
								default: 'info'
							}
						}
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PICK);
			assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ['debug', 'info', 'warn', 'error']);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].default, 'info');
		});

		test('variables in package arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.DOCKER,
					identifier: 'test-image',
					transport: { type: TransportType.STDIO },
					version: '1.0.0',
					packageArguments: [{
						type: 'named',
						name: '--host',
						value: '{db_host}',
						isRepeated: false,
						variables: {
							db_host: {
								description: 'Database host',
								default: 'localhost'
							}
						}
					}, {
						type: 'positional',
						value: '{database_name}',
						valueHint: 'database_name',
						isRepeated: false,
						variables: {
							database_name: {
								description: 'Name of the database to connect to',
								isRequired: true
							}
						}
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
					'run', '-i', '--rm',
					'test-image:1.0.0',
					'--host', '${input:db_host}',
					'${input:database_name}'
				]);
			}
			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);
		});

		test('positional arguments with value_hint should create input variables (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: '@example/math-tool',
					transport: { type: TransportType.STDIO },
					version: '2.0.1',
					packageArguments: [{
						type: 'positional',
						valueHint: 'calculation_type',
						description: 'Type of calculation to enable',
						isRequired: true,
						isRepeated: false
						// Note: No 'value' field, only value_hint - should create input variable
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			// BUG: Currently value_hint is used as literal value instead of creating input variable
			// Should create input variable instead
			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'calculation_type');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, 'Type of calculation to enable');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PROMPT);

			// Args should use input variable interpolation
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
					'@example/math-tool@2.0.1',
					'${input:calculation_type}'
				]);
			}
		});
	});

	suite('Edge Cases and Error Handling', () => {
		test('empty manifest should throw error', () => {
			const manifest: IGalleryMcpServerConfiguration = {};

			assert.throws(() => {
				service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
			}, /No server package found/);
		});

		test('manifest with no matching package type should use first package', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.PYTHON,
					transport: { type: TransportType.STDIO },
					identifier: 'python-server',
					version: '1.0.0'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.mcpServerConfiguration.config.command, 'uvx'); // Python command since that's the package type
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['python-server==1.0.0']);
			}
		});

		test('manifest with matching package type should use that package', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.PYTHON,
					transport: { type: TransportType.STDIO },
					identifier: 'python-server',
					version: '1.0.0'
				}, {
					registryType: RegistryType.NODE,
					transport: { type: TransportType.STDIO },
					identifier: 'node-server',
					version: '2.0.0'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.mcpServerConfiguration.config.command, 'npx');
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['node-server@2.0.0']);
			}
		});

		test('undefined environment variables should be omitted', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					transport: { type: TransportType.STDIO },
					identifier: 'test-server',
					version: '1.0.0'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.mcpServerConfiguration.config.env, undefined);
			}
		});

		test('named argument without value should only add name', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					transport: { type: TransportType.STDIO },
					identifier: 'test-server',
					version: '1.0.0',
					runtimeArguments: [{
						type: 'named',
						name: '--verbose',
						isRepeated: false
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['--verbose', 'test-server@1.0.0']);
			}
		});

		test('positional argument with undefined value should use value_hint', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
					transport: { type: TransportType.STDIO },
					version: '1.0.0',
					packageArguments: [{
						type: 'positional',
						valueHint: 'target_directory',
						isRepeated: false
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['test-server@1.0.0', 'target_directory']);
			}
		});

		test('named argument with no name should generate notice', () => {
			const manifest = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
					transport: { type: TransportType.STDIO },
					version: '1.0.0',
					runtimeArguments: [{
						type: 'named',
						value: 'some-value',
						isRepeated: false
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest as IGalleryMcpServerConfiguration, RegistryType.NODE);

			// Should generate a notice about the missing name
			assert.strictEqual(result.notices.length, 1);
			assert.ok(result.notices[0].includes('Named argument is missing a name'));
			assert.ok(result.notices[0].includes('some-value')); // Should include the argument details in JSON format

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['test-server@1.0.0']);
			}
		});

		test('named argument with empty name should generate notice', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
					transport: { type: TransportType.STDIO },
					version: '1.0.0',
					runtimeArguments: [{
						type: 'named',
						name: '',
						value: 'some-value',
						isRepeated: false
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			// Should generate a notice about the missing name
			assert.strictEqual(result.notices.length, 1);
			assert.ok(result.notices[0].includes('Named argument is missing a name'));
			assert.ok(result.notices[0].includes('some-value')); // Should include the argument details in JSON format

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['test-server@1.0.0']);
			}
		});
	});

	suite('Variable Processing Order', () => {
		test('should use explicit variables instead of auto-generating when both are possible', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
					transport: { type: TransportType.STDIO },
					version: '1.0.0',
					environmentVariables: [{
						name: 'API_KEY',
						value: 'Bearer {api_key}',
						description: 'Should not be used', // This should be ignored since we have explicit variables
						variables: {
							api_key: {
								description: 'Your API key',
								isSecret: true
							}
						}
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'api_key');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, 'Your API key');
			assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.mcpServerConfiguration.config.env?.['API_KEY'], 'Bearer ${input:api_key}');
			}
		});
	});
});
