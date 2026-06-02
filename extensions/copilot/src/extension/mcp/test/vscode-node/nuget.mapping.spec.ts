/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Copied from https://github.com/microsoft/vscode/blob/d49049e5263a64cba8c9ca33f89bb0ad198f3391/src/vs/platform/mcp/test/common/mcpManagementService.test.ts
// Refactored to use vitest

import { beforeEach, describe, expect, it } from 'vitest';
import { IGalleryMcpServerConfiguration, IMcpServerVariable, McpMappingUtility, McpServerType, McpServerVariableType, RegistryType, TransportType } from '../../vscode-node/nuget';

describe('McpManagementService - getMcpServerConfigurationFromManifest', () => {
	let service: McpMappingUtility;

	beforeEach(() => {
		service = new McpMappingUtility();
	});

	describe('NPM Package Tests', () => {
		it('basic NPM package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					registryBaseUrl: 'https://registry.npmjs.org',
					identifier: '@modelcontextprotocol/server-brave-search',
					version: '1.0.2',
					environmentVariables: [{
						name: 'BRAVE_API_KEY',
						value: 'test-key'
					}]
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.command).toBe('npx');
				expect(result.mcpServerConfiguration.config.args).toEqual(['@modelcontextprotocol/server-brave-search@1.0.2']);
				expect(result.mcpServerConfiguration.config.env).toEqual({ 'BRAVE_API_KEY': 'test-key' });
			}
			expect(result.mcpServerConfiguration.inputs).toBe(undefined);
		});

		it('NPM package without version', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					registryBaseUrl: 'https://registry.npmjs.org',
					identifier: '@modelcontextprotocol/everything',
					version: ''
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.command).toBe('npx');
				expect(result.mcpServerConfiguration.config.args).toEqual(['@modelcontextprotocol/everything']);
			}
		});

		it('NPM package with environment variables containing variables', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
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

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.env).toEqual({ 'API_KEY': 'key-${input:api_token}' });
			}
			expect(result.mcpServerConfiguration.inputs?.length).toBe(1);
			expect(result.mcpServerConfiguration.inputs?.[0].id).toBe('api_token');
			expect(result.mcpServerConfiguration.inputs?.[0].type).toBe(McpServerVariableType.PROMPT);
			expect(result.mcpServerConfiguration.inputs?.[0].description).toBe('Your API token');
			expect(result.mcpServerConfiguration.inputs?.[0].password).toBe(true);
		});

		it('environment variable with empty value should create input variable (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
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
			expect(result.mcpServerConfiguration.inputs?.length).toBe(1);
			expect(result.mcpServerConfiguration.inputs?.[0].id).toBe('BRAVE_API_KEY');
			expect(result.mcpServerConfiguration.inputs?.[0].description).toBe('Brave Search API Key');
			expect(result.mcpServerConfiguration.inputs?.[0].password).toBe(true);
			expect(result.mcpServerConfiguration.inputs?.[0].type).toBe(McpServerVariableType.PROMPT);

			// Environment should use input variable interpolation
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.env).toEqual({ 'BRAVE_API_KEY': '${input:BRAVE_API_KEY}' });
			}
		});

		it('environment variable with choices but empty value should create pick input (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
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
			expect(result.mcpServerConfiguration.inputs?.length).toBe(1);
			expect(result.mcpServerConfiguration.inputs?.[0].id).toBe('SSL_MODE');
			expect(result.mcpServerConfiguration.inputs?.[0].description).toBe('SSL connection mode');
			expect(result.mcpServerConfiguration.inputs?.[0].default).toBe('prefer');
			expect(result.mcpServerConfiguration.inputs?.[0].type).toBe(McpServerVariableType.PICK);
			expect(result.mcpServerConfiguration.inputs?.[0].options).toEqual(['disable', 'prefer', 'require']);

			// Environment should use input variable interpolation
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.env).toEqual({ 'SSL_MODE': '${input:SSL_MODE}' });
			}
		});

		it('NPM package with package arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
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

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.args).toEqual(['snyk@1.1298.0', 'mcp', '-t', 'stdio']);
			}
		});
	});

	describe('Python Package Tests', () => {
		it('basic Python package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.PYTHON,
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

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.command).toBe('uvx');
				expect(result.mcpServerConfiguration.config.args).toEqual(['weather-mcp-server==0.5.0']);
				expect(result.mcpServerConfiguration.config.env).toEqual({
					'WEATHER_API_KEY': 'test-key',
					'WEATHER_UNITS': 'celsius'
				});
			}
		});

		it('Python package without version', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.PYTHON,
					identifier: 'weather-mcp-server',
					version: ''
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.args).toEqual(['weather-mcp-server']);
			}
		});
	});

	describe('Docker Package Tests', () => {
		it('basic Docker package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.DOCKER,
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

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.command).toBe('docker');
				expect(result.mcpServerConfiguration.config.args).toEqual([
					'run', '-i', '--rm',
					'--mount', 'type=bind,src=/host/path,dst=/container/path',
					'-e', 'LOG_LEVEL',
					'mcp/filesystem:1.0.2',
					'/project'
				]);
				expect(result.mcpServerConfiguration.config.env).toEqual({ 'LOG_LEVEL': 'info' });
			}
		});

		it('Docker package with variables in runtime arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.DOCKER,
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

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.args).toEqual([
					'run', '-i', '--rm',
					'-e', 'DB_TYPE=${input:db_type}',
					'example/database-manager-mcp:3.1.0'
				]);
			}
			expect(result.mcpServerConfiguration.inputs?.length).toBe(1);
			expect(result.mcpServerConfiguration.inputs?.[0].id).toBe('db_type');
			expect(result.mcpServerConfiguration.inputs?.[0].type).toBe(McpServerVariableType.PICK);
			expect(result.mcpServerConfiguration.inputs?.[0].options).toEqual(['postgres', 'mysql', 'mongodb', 'redis']);
		});

		it('Docker package arguments without values should create input variables (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.DOCKER,
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
			expect(result.mcpServerConfiguration.inputs?.length).toBe(2);

			const hostInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'host');
			expect(hostInput?.description).toBe('Database host');
			expect(hostInput?.default).toBe('localhost');
			expect(hostInput?.type).toBe(McpServerVariableType.PROMPT);

			const dbNameInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'database_name');
			expect(dbNameInput?.description).toBe('Name of the database to connect to');
			expect(dbNameInput?.type).toBe(McpServerVariableType.PROMPT);

			// Args should use input variable interpolation
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.args).toEqual([
					'run', '-i', '--rm',
					'example/database-manager-mcp:3.1.0',
					'--host', '${input:host}',
					'${input:database_name}'
				]);
			}
		});

		it('Docker Hub backward compatibility', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.DOCKER,
					identifier: 'example/test-image',
					version: '1.0.0'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.command).toBe('docker');
				expect(result.mcpServerConfiguration.config.args).toEqual([
					'run', '-i', '--rm',
					'example/test-image:1.0.0'
				]);
			}
		});
	});

	describe('NuGet Package Tests', () => {
		it('basic NuGet package configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NUGET,
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

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.command).toBe('dnx');
				expect(result.mcpServerConfiguration.config.args).toEqual(['Knapcode.SampleMcpServer@0.5.0', '--yes']);
				expect(result.mcpServerConfiguration.config.env).toEqual({ 'WEATHER_CHOICES': 'sunny,cloudy,rainy' });
			}
		});

		it('NuGet package with package arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NUGET,
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
				expect(result.mcpServerConfiguration.config.args).toEqual([
					'Knapcode.SampleMcpServer@0.4.0-beta',
					'--yes',
					'--',
					'mcp',
					'start'
				]);
			}
		});
	});

	describe('Remote Server Tests', () => {
		it('SSE remote server configuration', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				remotes: [{
					type: TransportType.SSE,
					url: 'http://mcp-fs.anonymous.modelcontextprotocol.io/sse'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.REMOTE);
			if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
				expect(result.mcpServerConfiguration.config.url).toBe('http://mcp-fs.anonymous.modelcontextprotocol.io/sse');
				expect(result.mcpServerConfiguration.config.headers).toBe(undefined);
			}
		});

		it('SSE remote server with headers and variables', () => {
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

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.REMOTE);
			if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
				expect(result.mcpServerConfiguration.config.headers).toEqual({
					'X-API-Key': '${input:api_key}',
					'X-Region': 'us-east-1'
				});
			}
			expect(result.mcpServerConfiguration.inputs?.length).toBe(1);
			expect(result.mcpServerConfiguration.inputs?.[0].id).toBe('api_key');
			expect(result.mcpServerConfiguration.inputs?.[0].password).toBe(true);
		});

		it('streamable HTTP remote server', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				remotes: [{
					type: TransportType.STREAMABLE_HTTP,
					url: 'https://mcp.anonymous.modelcontextprotocol.io/http'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.REMOTE);
			if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
				expect(result.mcpServerConfiguration.config.url).toBe('https://mcp.anonymous.modelcontextprotocol.io/http');
			}
		});

		it('remote headers without values should create input variables', () => {
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

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.REMOTE);
			if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
				expect(result.mcpServerConfiguration.config.url).toBe('https://api.example.com/mcp');
				expect(result.mcpServerConfiguration.config.headers).toEqual({
					'Authorization': '${input:Authorization}',
					'X-Custom-Header': '${input:X-Custom-Header}'
				});
			}

			// Should create input variables for headers without values
			expect(result.mcpServerConfiguration.inputs?.length).toBe(2);

			const authInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'Authorization');
			expect(authInput?.description).toBe('API token for authentication');
			expect(authInput?.password).toBe(true);
			expect(authInput?.type).toBe(McpServerVariableType.PROMPT);

			const customInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'X-Custom-Header');
			expect(customInput?.description).toBe('Custom header value');
			expect(customInput?.default).toBe('default-value');
			expect(customInput?.type).toBe(McpServerVariableType.PICK);
			expect(customInput?.options).toEqual(['option1', 'option2', 'option3']);
		});
	});

	describe('Variable Interpolation Tests', () => {
		it('multiple variables in single value', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
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
				expect(result.mcpServerConfiguration.config.env).toEqual({
					'CONNECTION_STRING': 'server=${input:host};port=${input:port};database=${input:db_name}'
				});
			}
			expect(result.mcpServerConfiguration.inputs?.length).toBe(3);

			const hostInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'host');
			expect(hostInput?.default).toBe('localhost');
			expect(hostInput?.type).toBe(McpServerVariableType.PROMPT);

			const portInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'port');
			expect(portInput?.default).toBe('5432');

			const dbNameInput = result.mcpServerConfiguration.inputs?.find((i: IMcpServerVariable) => i.id === 'db_name');
			expect(dbNameInput?.description).toBe('Database name');
		});

		it('variable with choices creates pick input', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
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

			expect(result.mcpServerConfiguration.inputs?.length).toBe(1);
			expect(result.mcpServerConfiguration.inputs?.[0].type).toBe(McpServerVariableType.PICK);
			expect(result.mcpServerConfiguration.inputs?.[0].options).toEqual(['debug', 'info', 'warn', 'error']);
			expect(result.mcpServerConfiguration.inputs?.[0].default).toBe('info');
		});

		it('variables in package arguments', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.DOCKER,
					identifier: 'test-image',
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
				expect(result.mcpServerConfiguration.config.args).toEqual([
					'run', '-i', '--rm',
					'test-image:1.0.0',
					'--host', '${input:db_host}',
					'${input:database_name}'
				]);
			}
			expect(result.mcpServerConfiguration.inputs?.length).toBe(2);
		});

		it('positional arguments with value_hint should create input variables (GitHub issue #266106)', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: '@example/math-tool',
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
			expect(result.mcpServerConfiguration.inputs?.length).toBe(1);
			expect(result.mcpServerConfiguration.inputs?.[0].id).toBe('calculation_type');
			expect(result.mcpServerConfiguration.inputs?.[0].description).toBe('Type of calculation to enable');
			expect(result.mcpServerConfiguration.inputs?.[0].type).toBe(McpServerVariableType.PROMPT);

			// Args should use input variable interpolation
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.args).toEqual([
					'@example/math-tool@2.0.1',
					'${input:calculation_type}'
				]);
			}
		});
	});

	describe('Edge Cases and Error Handling', () => {
		it('empty manifest should throw error', () => {
			const manifest: IGalleryMcpServerConfiguration = {};

			expect(() => {
				service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
			}).toThrow();
		});

		it('manifest with no matching package type should use first package', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.PYTHON,
					identifier: 'python-server',
					version: '1.0.0'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			expect(result.mcpServerConfiguration.config.type).toBe(McpServerType.LOCAL);
			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.command).toBe('uvx'); // Python command since that's the package type
				expect(result.mcpServerConfiguration.config.args).toEqual(['python-server==1.0.0']);
			}
		});

		it('manifest with matching package type should use that package', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.PYTHON,
					identifier: 'python-server',
					version: '1.0.0'
				}, {
					registryType: RegistryType.NODE,
					identifier: 'node-server',
					version: '2.0.0'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.command).toBe('npx');
				expect(result.mcpServerConfiguration.config.args).toEqual(['node-server@2.0.0']);
			}
		});

		it('undefined environment variables should be omitted', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
					version: '1.0.0'
				}]
			};

			const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.env).toBe(undefined);
			}
		});

		it('named argument without value should only add name', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
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
				expect(result.mcpServerConfiguration.config.args).toEqual(['--verbose', 'test-server@1.0.0']);
			}
		});

		it('positional argument with undefined value should use value_hint', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
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
				expect(result.mcpServerConfiguration.config.args).toEqual(['test-server@1.0.0', 'target_directory']);
			}
		});

		it('named argument with no name should generate notice', () => {
			const manifest = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
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
			expect(result.notices.length).toBe(1);
			expect(result.notices[0].includes('Named argument is missing a name')).toBeTruthy();
			expect(result.notices[0].includes('some-value')).toBeTruthy(); // Should include the argument details in JSON format

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.args).toEqual(['test-server@1.0.0']);
			}
		});

		it('named argument with empty name should generate notice', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
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
			expect(result.notices.length).toBe(1);
			expect(result.notices[0].includes('Named argument is missing a name')).toBeTruthy();
			expect(result.notices[0].includes('some-value')).toBeTruthy(); // Should include the argument details in JSON format

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.args).toEqual(['test-server@1.0.0']);
			}
		});
	});

	describe('Variable Processing Order', () => {
		it('should use explicit variables instead of auto-generating when both are possible', () => {
			const manifest: IGalleryMcpServerConfiguration = {
				packages: [{
					registryType: RegistryType.NODE,
					identifier: 'test-server',
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

			expect(result.mcpServerConfiguration.inputs?.length).toBe(1);
			expect(result.mcpServerConfiguration.inputs?.[0].id).toBe('api_key');
			expect(result.mcpServerConfiguration.inputs?.[0].description).toBe('Your API key');
			expect(result.mcpServerConfiguration.inputs?.[0].password).toBe(true);

			if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
				expect(result.mcpServerConfiguration.config.env?.['API_KEY']).toBe('Bearer ${input:api_key}');
			}
		});
	});
});
