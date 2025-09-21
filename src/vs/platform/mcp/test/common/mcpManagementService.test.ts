/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AbstractCommonMcpManagementService } from '../../common/mcpManagementService.js';
import { IGalleryMcpServerConfiguration, RegistryType, TransportType } from '../../common/mcpManagement.js';
import { McpServerType, McpServerVariableType } from '../../common/mcpPlatformTypes.js';

class TestMcpManagementService extends AbstractCommonMcpManagementService {
	// Expose the protected method for testing
	public testGetMcpServerConfigurationFromManifest(manifest: IGalleryMcpServerConfiguration, packageType: RegistryType) {
		return this.getMcpServerConfigurationFromManifest(manifest, packageType);
	}
}

suite('McpManagementService - getMcpServerConfigurationFromManifest', () => {
	let service: TestMcpManagementService;

	setup(() => {
		service = new TestMcpManagementService();
	});

	teardown(() => {
		service.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('NPM Package Tests', () => {
		test('basic NPM package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					registry_base_url: 'https://registry.npmjs.org',
					identifier: '@modelcontextprotocol/server-brave-search',
					version: '1.0.2',
					environment_variables: [{
						name: 'BRAVE_API_KEY',
						value: 'test-key'
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.config.type, McpServerType.LOCAL);
			if (result.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.config.command, 'npx');
				assert.deepStrictEqual(result.config.args, ['@modelcontextprotocol/server-brave-search@1.0.2']);
				assert.deepStrictEqual(result.config.env, { 'BRAVE_API_KEY': 'test-key' });
			}
			assert.strictEqual(result.inputs, undefined);
		});

		test('NPM package without version', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					registry_base_url: 'https://registry.npmjs.org',
					identifier: '@modelcontextprotocol/everything',
					version: ''
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.config.type, McpServerType.LOCAL);
			if (result.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.config.command, 'npx');
				assert.deepStrictEqual(result.config.args, ['@modelcontextprotocol/everything']);
			}
		});

		test('NPM package with environment variables containing variables', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					identifier: 'test-server',
					version: '1.0.0',
					environment_variables: [{
						name: 'API_KEY',
						value: 'key-{api_token}',
						variables: {
							api_token: {
								description: 'Your API token',
								is_secret: true,
								is_required: true
							}
						}
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.config.type, McpServerType.LOCAL);
			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.env, { 'API_KEY': 'key-${input:api_token}' });
			}
			assert.strictEqual(result.inputs?.length, 1);
			assert.strictEqual(result.inputs?.[0].id, 'api_token');
			assert.strictEqual(result.inputs?.[0].type, McpServerVariableType.PROMPT);
			assert.strictEqual(result.inputs?.[0].description, 'Your API token');
			assert.strictEqual(result.inputs?.[0].password, true);
		});

		test('environment variable with empty value should create input variable (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					identifier: '@modelcontextprotocol/server-brave-search',
					version: '1.0.2',
					environment_variables: [{
						name: 'BRAVE_API_KEY',
						value: '', // Empty value should create input variable
						description: 'Brave Search API Key',
						is_required: true,
						is_secret: true
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			// BUG: Currently this creates env with empty string instead of input variable
			// Should create an input variable since no meaningful value is provided
			assert.strictEqual(result.inputs?.length, 1);
			assert.strictEqual(result.inputs?.[0].id, 'BRAVE_API_KEY');
			assert.strictEqual(result.inputs?.[0].description, 'Brave Search API Key');
			assert.strictEqual(result.inputs?.[0].password, true);
			assert.strictEqual(result.inputs?.[0].type, McpServerVariableType.PROMPT);

			// Environment should use input variable interpolation
			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.env, { 'BRAVE_API_KEY': '${input:BRAVE_API_KEY}' });
			}
		});

		test('environment variable with choices but empty value should create pick input (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					identifier: 'test-server',
					version: '1.0.0',
					environment_variables: [{
						name: 'SSL_MODE',
						value: '', // Empty value should create input variable
						description: 'SSL connection mode',
						default: 'prefer',
						choices: ['disable', 'prefer', 'require']
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			// BUG: Currently this creates env with empty string instead of input variable
			// Should create a pick input variable since choices are provided
			assert.strictEqual(result.inputs?.length, 1);
			assert.strictEqual(result.inputs?.[0].id, 'SSL_MODE');
			assert.strictEqual(result.inputs?.[0].description, 'SSL connection mode');
			assert.strictEqual(result.inputs?.[0].default, 'prefer');
			assert.strictEqual(result.inputs?.[0].type, McpServerVariableType.PICK);
			assert.deepStrictEqual(result.inputs?.[0].options, ['disable', 'prefer', 'require']);

			// Environment should use input variable interpolation
			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.env, { 'SSL_MODE': '${input:SSL_MODE}' });
			}
		});

		test('NPM package with package arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					identifier: 'snyk',
					version: '1.1298.0',
					package_arguments: [
						{ type: 'positional', value: 'mcp', value_hint: 'command', is_repeated: false },
						{
							type: 'named',
							name: '-t',
							value: 'stdio',
							is_repeated: false
						}
					]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.config.type, McpServerType.LOCAL);
			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.args, ['snyk@1.1298.0', 'mcp', '-t', 'stdio']);
			}
		});
	});

	suite('Python Package Tests', () => {
		test('basic Python package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.PYTHON,
					registry_base_url: 'https://pypi.org',
					identifier: 'weather-mcp-server',
					version: '0.5.0',
					environment_variables: [{
						name: 'WEATHER_API_KEY',
						value: 'test-key'
					}, {
						name: 'WEATHER_UNITS',
						value: 'celsius'
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);

			assert.strictEqual(result.config.type, McpServerType.LOCAL);
			if (result.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.config.command, 'uvx');
				assert.deepStrictEqual(result.config.args, ['weather-mcp-server==0.5.0']);
				assert.deepStrictEqual(result.config.env, {
					'WEATHER_API_KEY': 'test-key',
					'WEATHER_UNITS': 'celsius'
				});
			}
		});

		test('Python package without version', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.PYTHON,
					identifier: 'weather-mcp-server',
					version: ''
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);

			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.args, ['weather-mcp-server']);
			}
		});
	});

	suite('Docker Package Tests', () => {
		test('basic Docker package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.DOCKER,
					registry_base_url: 'https://docker.io',
					identifier: 'mcp/filesystem',
					version: '1.0.2',
					runtime_arguments: [{
						type: 'named',
						name: '--mount',
						value: 'type=bind,src=/host/path,dst=/container/path',
						is_repeated: false
					}],
					environment_variables: [{
						name: 'LOG_LEVEL',
						value: 'info'
					}],
					package_arguments: [{
						type: 'positional',
						value: '/project',
						value_hint: 'directory',
						is_repeated: false
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);

			assert.strictEqual(result.config.type, McpServerType.LOCAL);
			if (result.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.config.command, 'docker');
				assert.deepStrictEqual(result.config.args, [
					'run', '-i', '--rm',
					'--mount', 'type=bind,src=/host/path,dst=/container/path',
					'-e', 'LOG_LEVEL',
					'mcp/filesystem:1.0.2',
					'/project'
				]);
				assert.deepStrictEqual(result.config.env, { 'LOG_LEVEL': 'info' });
			}
		});

		test('Docker package with variables in runtime arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.DOCKER,
					identifier: 'example/database-manager-mcp',
					version: '3.1.0',
					runtime_arguments: [{
						type: 'named',
						name: '-e',
						value: 'DB_TYPE={db_type}',
						is_repeated: false,
						variables: {
							db_type: {
								description: 'Type of database',
								choices: ['postgres', 'mysql', 'mongodb', 'redis'],
								is_required: true
							}
						}
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);

			assert.strictEqual(result.config.type, McpServerType.LOCAL);
			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.args, [
					'run', '-i', '--rm',
					'-e', 'DB_TYPE=${input:db_type}',
					'example/database-manager-mcp:3.1.0'
				]);
			}
			assert.strictEqual(result.inputs?.length, 1);
			assert.strictEqual(result.inputs?.[0].id, 'db_type');
			assert.strictEqual(result.inputs?.[0].type, McpServerVariableType.PICK);
			assert.deepStrictEqual(result.inputs?.[0].options, ['postgres', 'mysql', 'mongodb', 'redis']);
		});

		test('Docker package arguments without values should create input variables (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.DOCKER,
					identifier: 'example/database-manager-mcp',
					version: '3.1.0',
					package_arguments: [{
						type: 'named',
						name: '--host',
						description: 'Database host',
						default: 'localhost',
						is_required: true,
						is_repeated: false
						// Note: No 'value' field - should create input variable
					}, {
						type: 'positional',
						value_hint: 'database_name',
						description: 'Name of the database to connect to',
						is_required: true,
						is_repeated: false
						// Note: No 'value' field - should create input variable
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);

			// BUG: Currently named args without value are ignored, positional uses value_hint as literal
			// Should create input variables for both arguments
			assert.strictEqual(result.inputs?.length, 2);

			const hostInput = result.inputs?.find(i => i.id === 'host');
			assert.strictEqual(hostInput?.description, 'Database host');
			assert.strictEqual(hostInput?.default, 'localhost');
			assert.strictEqual(hostInput?.type, McpServerVariableType.PROMPT);

			const dbNameInput = result.inputs?.find(i => i.id === 'database_name');
			assert.strictEqual(dbNameInput?.description, 'Name of the database to connect to');
			assert.strictEqual(dbNameInput?.type, McpServerVariableType.PROMPT);

			// Args should use input variable interpolation
			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.args, [
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
					registry_type: RegistryType.DOCKER_HUB,
					identifier: 'example/test-image',
					version: '1.0.0'
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER_HUB);

			assert.strictEqual(result.config.type, McpServerType.LOCAL);
			if (result.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.config.command, 'docker');
				assert.deepStrictEqual(result.config.args, [
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
					registry_type: RegistryType.NUGET,
					registry_base_url: 'https://api.nuget.org',
					identifier: 'Knapcode.SampleMcpServer',
					version: '0.5.0',
					environment_variables: [{
						name: 'WEATHER_CHOICES',
						value: 'sunny,cloudy,rainy'
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NUGET);

			assert.strictEqual(result.config.type, McpServerType.LOCAL);
			if (result.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.config.command, 'dnx');
				assert.deepStrictEqual(result.config.args, ['Knapcode.SampleMcpServer@0.5.0', '--yes']);
				assert.deepStrictEqual(result.config.env, { 'WEATHER_CHOICES': 'sunny,cloudy,rainy' });
			}
		});

		test('NuGet package with package arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NUGET,
					identifier: 'Knapcode.SampleMcpServer',
					version: '0.4.0-beta',
					package_arguments: [{
						type: 'positional',
						value: 'mcp',
						value_hint: 'command',
						is_repeated: false
					}, {
						type: 'positional',
						value: 'start',
						value_hint: 'action',
						is_repeated: false
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NUGET);

			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.args, [
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

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);

			assert.strictEqual(result.config.type, McpServerType.REMOTE);
			if (result.config.type === McpServerType.REMOTE) {
				assert.strictEqual(result.config.url, 'http://mcp-fs.anonymous.modelcontextprotocol.io/sse');
				assert.strictEqual(result.config.headers, undefined);
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
								is_required: true,
								is_secret: true
							}
						}
					}, {
						name: 'X-Region',
						value: 'us-east-1'
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);

			assert.strictEqual(result.config.type, McpServerType.REMOTE);
			if (result.config.type === McpServerType.REMOTE) {
				assert.deepStrictEqual(result.config.headers, {
					'X-API-Key': '${input:api_key}',
					'X-Region': 'us-east-1'
				});
			}
			assert.strictEqual(result.inputs?.length, 1);
			assert.strictEqual(result.inputs?.[0].id, 'api_key');
			assert.strictEqual(result.inputs?.[0].password, true);
		});

		test('streamable HTTP remote server', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				remotes: [{
					type: TransportType.STREAMABLE_HTTP,
					url: 'https://mcp.anonymous.modelcontextprotocol.io/http'
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);

			assert.strictEqual(result.config.type, McpServerType.REMOTE);
			if (result.config.type === McpServerType.REMOTE) {
				assert.strictEqual(result.config.url, 'https://mcp.anonymous.modelcontextprotocol.io/http');
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
						is_secret: true,
						is_required: true
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

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);

			assert.strictEqual(result.config.type, McpServerType.REMOTE);
			if (result.config.type === McpServerType.REMOTE) {
				assert.strictEqual(result.config.url, 'https://api.example.com/mcp');
				assert.deepStrictEqual(result.config.headers, {
					'Authorization': '${input:Authorization}',
					'X-Custom-Header': '${input:X-Custom-Header}'
				});
			}

			// Should create input variables for headers without values
			assert.strictEqual(result.inputs?.length, 2);

			const authInput = result.inputs?.find(i => i.id === 'Authorization');
			assert.strictEqual(authInput?.description, 'API token for authentication');
			assert.strictEqual(authInput?.password, true);
			assert.strictEqual(authInput?.type, McpServerVariableType.PROMPT);

			const customInput = result.inputs?.find(i => i.id === 'X-Custom-Header');
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
					registry_type: RegistryType.NODE,
					identifier: 'test-server',
					version: '1.0.0',
					environment_variables: [{
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
								is_required: true
							}
						}
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.env, {
					'CONNECTION_STRING': 'server=${input:host};port=${input:port};database=${input:db_name}'
				});
			}
			assert.strictEqual(result.inputs?.length, 3);

			const hostInput = result.inputs?.find(i => i.id === 'host');
			assert.strictEqual(hostInput?.default, 'localhost');
			assert.strictEqual(hostInput?.type, McpServerVariableType.PROMPT);

			const portInput = result.inputs?.find(i => i.id === 'port');
			assert.strictEqual(portInput?.default, '5432');

			const dbNameInput = result.inputs?.find(i => i.id === 'db_name');
			assert.strictEqual(dbNameInput?.description, 'Database name');
		});

		test('variable with choices creates pick input', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					identifier: 'test-server',
					version: '1.0.0',
					runtime_arguments: [{
						type: 'named',
						name: '--log-level',
						value: '{level}',
						is_repeated: false,
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

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.inputs?.length, 1);
			assert.strictEqual(result.inputs?.[0].type, McpServerVariableType.PICK);
			assert.deepStrictEqual(result.inputs?.[0].options, ['debug', 'info', 'warn', 'error']);
			assert.strictEqual(result.inputs?.[0].default, 'info');
		});

		test('variables in package arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.DOCKER,
					identifier: 'test-image',
					version: '1.0.0',
					package_arguments: [{
						type: 'named',
						name: '--host',
						value: '{db_host}',
						is_repeated: false,
						variables: {
							db_host: {
								description: 'Database host',
								default: 'localhost'
							}
						}
					}, {
						type: 'positional',
						value: '{database_name}',
						value_hint: 'database_name',
						is_repeated: false,
						variables: {
							database_name: {
								description: 'Name of the database to connect to',
								is_required: true
							}
						}
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);

			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.args, [
					'run', '-i', '--rm',
					'test-image:1.0.0',
					'--host', '${input:db_host}',
					'${input:database_name}'
				]);
			}
			assert.strictEqual(result.inputs?.length, 2);
		});

		test('positional arguments with value_hint should create input variables (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					identifier: '@example/math-tool',
					version: '2.0.1',
					package_arguments: [{
						type: 'positional',
						value_hint: 'calculation_type',
						description: 'Type of calculation to enable',
						is_required: true,
						is_repeated: false
						// Note: No 'value' field, only value_hint - should create input variable
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			// BUG: Currently value_hint is used as literal value instead of creating input variable
			// Should create input variable instead
			assert.strictEqual(result.inputs?.length, 1);
			assert.strictEqual(result.inputs?.[0].id, 'calculation_type');
			assert.strictEqual(result.inputs?.[0].description, 'Type of calculation to enable');
			assert.strictEqual(result.inputs?.[0].type, McpServerVariableType.PROMPT);

			// Args should use input variable interpolation
			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.args, [
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
				service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
			}, /No server package found/);
		});

		test('manifest with no matching package type should use first package', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.PYTHON,
					identifier: 'python-server',
					version: '1.0.0'
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.config.type, McpServerType.LOCAL);
			if (result.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.config.command, 'uvx'); // Python command since that's the package type
				assert.deepStrictEqual(result.config.args, ['python-server==1.0.0']);
			}
		});

		test('manifest with matching package type should use that package', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.PYTHON,
					identifier: 'python-server',
					version: '1.0.0'
				}, {
					registry_type: RegistryType.NODE,
					identifier: 'node-server',
					version: '2.0.0'
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.config.command, 'npx');
				assert.deepStrictEqual(result.config.args, ['node-server@2.0.0']);
			}
		});

		test('undefined environment variables should be omitted', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					identifier: 'test-server',
					version: '1.0.0'
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.config.env, undefined);
			}
		});

		test('named argument without value should only add name', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					identifier: 'test-server',
					version: '1.0.0',
					runtime_arguments: [{
						type: 'named',
						name: '--verbose',
						is_repeated: false
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.args, ['--verbose', 'test-server@1.0.0']);
			}
		});

		test('positional argument with undefined value should use value_hint', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					identifier: 'test-server',
					version: '1.0.0',
					package_arguments: [{
						type: 'positional',
						value_hint: 'target_directory',
						is_repeated: false
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.config.type === McpServerType.LOCAL) {
				assert.deepStrictEqual(result.config.args, ['test-server@1.0.0', 'target_directory']);
			}
		});
	});

	suite('Variable Processing Order', () => {
		test('should use explicit variables instead of auto-generating when both are possible', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registry_type: RegistryType.NODE,
					identifier: 'test-server',
					version: '1.0.0',
					environment_variables: [{
						name: 'API_KEY',
						value: 'Bearer {api_key}',
						description: 'Should not be used', // This should be ignored since we have explicit variables
						variables: {
							api_key: {
								description: 'Your API key',
								is_secret: true
							}
						}
					}]
				}]
			};

			const result = service.testGetMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			assert.strictEqual(result.inputs?.length, 1);
			assert.strictEqual(result.inputs?.[0].id, 'api_key');
			assert.strictEqual(result.inputs?.[0].description, 'Your API key');
			assert.strictEqual(result.inputs?.[0].password, true);

			if (result.config.type === McpServerType.LOCAL) {
				assert.strictEqual(result.config.env?.['API_KEY'], 'Bearer ${input:api_key}');
			}
		});
	});
});
