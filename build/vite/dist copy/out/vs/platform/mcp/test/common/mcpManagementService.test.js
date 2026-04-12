/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { AbstractCommonMcpManagementService, AbstractMcpResourceManagementService } from '../../common/mcpManagementService.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { McpResourceScannerService } from '../../common/mcpResourceScannerService.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
class TestMcpManagementService extends AbstractCommonMcpManagementService {
    constructor() {
        super(...arguments);
        this.onInstallMcpServer = Event.None;
        this.onDidInstallMcpServers = Event.None;
        this.onDidUpdateMcpServers = Event.None;
        this.onUninstallMcpServer = Event.None;
        this.onDidUninstallMcpServer = Event.None;
    }
    getInstalled(mcpResource) {
        throw new Error('Method not implemented.');
    }
    install(server, options) {
        throw new Error('Method not implemented.');
    }
    installFromGallery(server, options) {
        throw new Error('Method not implemented.');
    }
    updateMetadata(local, server, profileLocation) {
        throw new Error('Method not implemented.');
    }
    uninstall(server, options) {
        throw new Error('Method not implemented.');
    }
    canInstall(server) {
        throw new Error('Not supported');
    }
}
class TestMcpResourceManagementService extends AbstractMcpResourceManagementService {
    constructor(mcpResource, fileService, uriIdentityService, mcpResourceScannerService) {
        super(mcpResource, 2 /* ConfigurationTarget.USER */, {}, fileService, uriIdentityService, new NullLogService(), mcpResourceScannerService);
    }
    reload() {
        return this.updateLocal();
    }
    canInstall(_server) {
        throw new Error('Not supported');
    }
    getLocalServerInfo(_name, _mcpServerConfig) {
        return Promise.resolve(undefined);
    }
    installFromUri(_uri) {
        throw new Error('Not supported');
    }
    installFromGallery(_server, _options) {
        throw new Error('Not supported');
    }
    updateMetadata(_local, _server) {
        throw new Error('Not supported');
    }
}
suite('McpManagementService - getMcpServerConfigurationFromManifest', () => {
    let service;
    setup(() => {
        service = new TestMcpManagementService(new NullLogService());
    });
    teardown(() => {
        service.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('NPM Package Tests', () => {
        test('basic NPM package configuration', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        identifier: '@modelcontextprotocol/server-brave-search',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        version: '1.0.2',
                        environmentVariables: [{
                                name: 'BRAVE_API_KEY',
                                value: 'test-key'
                            }]
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.command, 'npx');
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['@modelcontextprotocol/server-brave-search@1.0.2']);
                assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'BRAVE_API_KEY': 'test-key' });
            }
            assert.strictEqual(result.mcpServerConfiguration.inputs, undefined);
        });
        test('NPM package with custom registry URL', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        registryBaseUrl: 'https://custom-registry.example.com',
                        identifier: '@company/internal-package',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        version: '2.1.0'
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.command, 'npx');
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
                    '--registry', 'https://custom-registry.example.com',
                    '@company/internal-package@2.1.0'
                ]);
            }
        });
        test('NPM package without version', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        identifier: '@modelcontextprotocol/everything',
                        version: '',
                        transport: { type: "stdio" /* TransportType.STDIO */ }
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.command, 'npx');
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['@modelcontextprotocol/everything']);
            }
        });
        test('NPM package with environment variables containing variables', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'API_KEY': 'key-${input:api_token}' });
            }
            assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'api_token');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, "promptString" /* McpServerVariableType.PROMPT */);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, 'Your API token');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
        });
        test('environment variable with empty value should create input variable (GitHub issue #266106)', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            // BUG: Currently this creates env with empty string instead of input variable
            // Should create an input variable since no meaningful value is provided
            assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'BRAVE_API_KEY');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, 'Brave Search API Key');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, "promptString" /* McpServerVariableType.PROMPT */);
            // Environment should use input variable interpolation
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'BRAVE_API_KEY': '${input:BRAVE_API_KEY}' });
            }
        });
        test('environment variable with choices but empty value should create pick input (GitHub issue #266106)', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            // BUG: Currently this creates env with empty string instead of input variable
            // Should create a pick input variable since choices are provided
            assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'SSL_MODE');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, 'SSL connection mode');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].default, 'prefer');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, "pickString" /* McpServerVariableType.PICK */);
            assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ['disable', 'prefer', 'require']);
            // Environment should use input variable interpolation
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'SSL_MODE': '${input:SSL_MODE}' });
            }
        });
        test('NPM package with package arguments', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['snyk@1.1298.0', 'mcp', '-t', 'stdio']);
            }
        });
    });
    suite('Python Package Tests', () => {
        test('basic Python package configuration', () => {
            const manifest = {
                packages: [{
                        registryType: "pypi" /* RegistryType.PYTHON */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "pypi" /* RegistryType.PYTHON */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.command, 'uvx');
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['weather-mcp-server@0.5.0']);
                assert.deepStrictEqual(result.mcpServerConfiguration.config.env, {
                    'WEATHER_API_KEY': 'test-key',
                    'WEATHER_UNITS': 'celsius'
                });
            }
        });
        test('Python package with custom registry URL', () => {
            const manifest = {
                packages: [{
                        registryType: "pypi" /* RegistryType.PYTHON */,
                        registryBaseUrl: 'https://custom-pypi.example.com/simple',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        identifier: 'internal-python-server',
                        version: '1.2.3'
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "pypi" /* RegistryType.PYTHON */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.command, 'uvx');
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
                    '--index-url', 'https://custom-pypi.example.com/simple',
                    'internal-python-server@1.2.3'
                ]);
            }
        });
        test('Python package without version', () => {
            const manifest = {
                packages: [{
                        registryType: "pypi" /* RegistryType.PYTHON */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        identifier: 'weather-mcp-server',
                        version: ''
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "pypi" /* RegistryType.PYTHON */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['weather-mcp-server']);
            }
        });
    });
    suite('Docker Package Tests', () => {
        test('basic Docker package configuration', () => {
            const manifest = {
                packages: [{
                        registryType: "oci" /* RegistryType.DOCKER */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "oci" /* RegistryType.DOCKER */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
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
        test('Docker package with custom registry URL', () => {
            const manifest = {
                packages: [{
                        registryType: "oci" /* RegistryType.DOCKER */,
                        registryBaseUrl: 'registry.company.com',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        identifier: 'internal/mcp-server',
                        version: '3.2.1'
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "oci" /* RegistryType.DOCKER */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.command, 'docker');
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
                    'run', '-i', '--rm',
                    'registry.company.com/internal/mcp-server:3.2.1'
                ]);
            }
        });
        test('Docker package with variables in runtime arguments', () => {
            const manifest = {
                packages: [{
                        registryType: "oci" /* RegistryType.DOCKER */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "oci" /* RegistryType.DOCKER */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
                    'run', '-i', '--rm',
                    '-e', 'DB_TYPE=${input:db_type}',
                    'example/database-manager-mcp:3.1.0'
                ]);
            }
            assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'db_type');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, "pickString" /* McpServerVariableType.PICK */);
            assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ['postgres', 'mysql', 'mongodb', 'redis']);
        });
        test('Docker package arguments without values should create input variables (GitHub issue #266106)', () => {
            const manifest = {
                packages: [{
                        registryType: "oci" /* RegistryType.DOCKER */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "oci" /* RegistryType.DOCKER */);
            // BUG: Currently named args without value are ignored, positional uses value_hint as literal
            // Should create input variables for both arguments
            assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);
            const hostInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === 'host');
            assert.strictEqual(hostInput?.description, 'Database host');
            assert.strictEqual(hostInput?.default, 'localhost');
            assert.strictEqual(hostInput?.type, "promptString" /* McpServerVariableType.PROMPT */);
            const dbNameInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === 'database_name');
            assert.strictEqual(dbNameInput?.description, 'Name of the database to connect to');
            assert.strictEqual(dbNameInput?.type, "promptString" /* McpServerVariableType.PROMPT */);
            // Args should use input variable interpolation
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
                    'run', '-i', '--rm',
                    'example/database-manager-mcp:3.1.0',
                    '--host', '${input:host}',
                    '${input:database_name}'
                ]);
            }
        });
        test('Docker Hub backward compatibility', () => {
            const manifest = {
                packages: [{
                        registryType: "oci" /* RegistryType.DOCKER */,
                        identifier: 'example/test-image',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        version: '1.0.0'
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "oci" /* RegistryType.DOCKER */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
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
            const manifest = {
                packages: [{
                        registryType: "nuget" /* RegistryType.NUGET */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        identifier: 'Knapcode.SampleMcpServer',
                        version: '0.5.0',
                        environmentVariables: [{
                                name: 'WEATHER_CHOICES',
                                value: 'sunny,cloudy,rainy'
                            }]
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "nuget" /* RegistryType.NUGET */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.command, 'dnx');
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['Knapcode.SampleMcpServer@0.5.0', '--yes']);
                assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { 'WEATHER_CHOICES': 'sunny,cloudy,rainy' });
            }
        });
        test('NuGet package with custom registry URL', () => {
            const manifest = {
                packages: [{
                        registryType: "nuget" /* RegistryType.NUGET */,
                        registryBaseUrl: 'https://nuget.company.com/v3/index.json',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        identifier: 'Company.Internal.McpServer',
                        version: '4.5.6'
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "nuget" /* RegistryType.NUGET */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.command, 'dnx');
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
                    'Company.Internal.McpServer@4.5.6',
                    '--yes',
                    '--source', 'https://nuget.company.com/v3/index.json'
                ]);
            }
        });
        test('NuGet package with package arguments', () => {
            const manifest = {
                packages: [{
                        registryType: "nuget" /* RegistryType.NUGET */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "nuget" /* RegistryType.NUGET */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
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
            const manifest = {
                remotes: [{
                        type: "sse" /* TransportType.SSE */,
                        url: 'http://mcp-fs.anonymous.modelcontextprotocol.io/sse'
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "remote" /* RegistryType.REMOTE */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "http" /* McpServerType.REMOTE */);
            if (result.mcpServerConfiguration.config.type === "http" /* McpServerType.REMOTE */) {
                assert.strictEqual(result.mcpServerConfiguration.config.url, 'http://mcp-fs.anonymous.modelcontextprotocol.io/sse');
                assert.strictEqual(result.mcpServerConfiguration.config.headers, undefined);
            }
        });
        test('SSE remote server with headers and variables', () => {
            const manifest = {
                remotes: [{
                        type: "sse" /* TransportType.SSE */,
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "remote" /* RegistryType.REMOTE */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "http" /* McpServerType.REMOTE */);
            if (result.mcpServerConfiguration.config.type === "http" /* McpServerType.REMOTE */) {
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
            const manifest = {
                remotes: [{
                        type: "streamable-http" /* TransportType.STREAMABLE_HTTP */,
                        url: 'https://mcp.anonymous.modelcontextprotocol.io/http'
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "remote" /* RegistryType.REMOTE */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "http" /* McpServerType.REMOTE */);
            if (result.mcpServerConfiguration.config.type === "http" /* McpServerType.REMOTE */) {
                assert.strictEqual(result.mcpServerConfiguration.config.url, 'https://mcp.anonymous.modelcontextprotocol.io/http');
            }
        });
        test('remote headers without values should create input variables', () => {
            const manifest = {
                remotes: [{
                        type: "sse" /* TransportType.SSE */,
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "remote" /* RegistryType.REMOTE */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "http" /* McpServerType.REMOTE */);
            if (result.mcpServerConfiguration.config.type === "http" /* McpServerType.REMOTE */) {
                assert.strictEqual(result.mcpServerConfiguration.config.url, 'https://api.example.com/mcp');
                assert.deepStrictEqual(result.mcpServerConfiguration.config.headers, {
                    'Authorization': '${input:Authorization}',
                    'X-Custom-Header': '${input:X-Custom-Header}'
                });
            }
            // Should create input variables for headers without values
            assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);
            const authInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === 'Authorization');
            assert.strictEqual(authInput?.description, 'API token for authentication');
            assert.strictEqual(authInput?.password, true);
            assert.strictEqual(authInput?.type, "promptString" /* McpServerVariableType.PROMPT */);
            const customInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === 'X-Custom-Header');
            assert.strictEqual(customInput?.description, 'Custom header value');
            assert.strictEqual(customInput?.default, 'default-value');
            assert.strictEqual(customInput?.type, "pickString" /* McpServerVariableType.PICK */);
            assert.deepStrictEqual(customInput?.options, ['option1', 'option2', 'option3']);
        });
    });
    suite('Variable Interpolation Tests', () => {
        test('multiple variables in single value', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        identifier: 'test-server',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.env, {
                    'CONNECTION_STRING': 'server=${input:host};port=${input:port};database=${input:db_name}'
                });
            }
            assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 3);
            const hostInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === 'host');
            assert.strictEqual(hostInput?.default, 'localhost');
            assert.strictEqual(hostInput?.type, "promptString" /* McpServerVariableType.PROMPT */);
            const portInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === 'port');
            assert.strictEqual(portInput?.default, '5432');
            const dbNameInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === 'db_name');
            assert.strictEqual(dbNameInput?.description, 'Database name');
        });
        test('variable with choices creates pick input', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        identifier: 'test-server',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, "pickString" /* McpServerVariableType.PICK */);
            assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ['debug', 'info', 'warn', 'error']);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].default, 'info');
        });
        test('variables in package arguments', () => {
            const manifest = {
                packages: [{
                        registryType: "oci" /* RegistryType.DOCKER */,
                        identifier: 'test-image',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "oci" /* RegistryType.DOCKER */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
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
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        identifier: '@example/math-tool',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            // BUG: Currently value_hint is used as literal value instead of creating input variable
            // Should create input variable instead
            assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'calculation_type');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, 'Type of calculation to enable');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, "promptString" /* McpServerVariableType.PROMPT */);
            // Args should use input variable interpolation
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
                    '@example/math-tool@2.0.1',
                    '${input:calculation_type}'
                ]);
            }
        });
    });
    suite('Edge Cases and Error Handling', () => {
        test('empty manifest should throw error', () => {
            const manifest = {};
            assert.throws(() => {
                service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            }, /No server package found/);
        });
        test('manifest with no matching package type should use first package', () => {
            const manifest = {
                packages: [{
                        registryType: "pypi" /* RegistryType.PYTHON */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        identifier: 'python-server',
                        version: '1.0.0'
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            assert.strictEqual(result.mcpServerConfiguration.config.type, "stdio" /* McpServerType.LOCAL */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.command, 'uvx'); // Python command since that's the package type
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['python-server@1.0.0']);
            }
        });
        test('manifest with matching package type should use that package', () => {
            const manifest = {
                packages: [{
                        registryType: "pypi" /* RegistryType.PYTHON */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        identifier: 'python-server',
                        version: '1.0.0'
                    }, {
                        registryType: "npm" /* RegistryType.NODE */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        identifier: 'node-server',
                        version: '2.0.0'
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.command, 'npx');
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['node-server@2.0.0']);
            }
        });
        test('undefined environment variables should be omitted', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        identifier: 'test-server',
                        version: '1.0.0'
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.env, undefined);
            }
        });
        test('named argument without value should only add name', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        identifier: 'test-server',
                        version: '1.0.0',
                        runtimeArguments: [{
                                type: 'named',
                                name: '--verbose',
                                isRepeated: false
                            }]
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['--verbose', 'test-server@1.0.0']);
            }
        });
        test('positional argument with undefined value should use value_hint', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        identifier: 'test-server',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        version: '1.0.0',
                        packageArguments: [{
                                type: 'positional',
                                valueHint: 'target_directory',
                                isRepeated: false
                            }]
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['test-server@1.0.0', 'target_directory']);
            }
        });
        test('named argument with no name should generate notice', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        identifier: 'test-server',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        version: '1.0.0',
                        runtimeArguments: [{
                                type: 'named',
                                value: 'some-value',
                                isRepeated: false
                            }]
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            // Should generate a notice about the missing name
            assert.strictEqual(result.notices.length, 1);
            assert.ok(result.notices[0].includes('Named argument is missing a name'));
            assert.ok(result.notices[0].includes('some-value')); // Should include the argument details in JSON format
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['test-server@1.0.0']);
            }
        });
        test('named argument with empty name should generate notice', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        identifier: 'test-server',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
                        version: '1.0.0',
                        runtimeArguments: [{
                                type: 'named',
                                name: '',
                                value: 'some-value',
                                isRepeated: false
                            }]
                    }]
            };
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            // Should generate a notice about the missing name
            assert.strictEqual(result.notices.length, 1);
            assert.ok(result.notices[0].includes('Named argument is missing a name'));
            assert.ok(result.notices[0].includes('some-value')); // Should include the argument details in JSON format
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ['test-server@1.0.0']);
            }
        });
    });
    suite('Variable Processing Order', () => {
        test('should use explicit variables instead of auto-generating when both are possible', () => {
            const manifest = {
                packages: [{
                        registryType: "npm" /* RegistryType.NODE */,
                        identifier: 'test-server',
                        transport: { type: "stdio" /* TransportType.STDIO */ },
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
            const result = service.getMcpServerConfigurationFromManifest(manifest, "npm" /* RegistryType.NODE */);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, 'api_key');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, 'Your API key');
            assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
            if (result.mcpServerConfiguration.config.type === "stdio" /* McpServerType.LOCAL */) {
                assert.strictEqual(result.mcpServerConfiguration.config.env?.['API_KEY'], 'Bearer ${input:api_key}');
            }
        });
    });
});
suite('McpResourceManagementService', () => {
    const mcpResource = URI.from({ scheme: Schemas.inMemory, path: '/mcp.json' });
    let disposables;
    let fileService;
    let service;
    setup(async () => {
        disposables = new DisposableStore();
        fileService = disposables.add(new FileService(new NullLogService()));
        disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
        const uriIdentityService = disposables.add(new UriIdentityService(fileService));
        const scannerService = disposables.add(new McpResourceScannerService(fileService, uriIdentityService));
        service = disposables.add(new TestMcpResourceManagementService(mcpResource, fileService, uriIdentityService, scannerService));
        await fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
            sandbox: {
                network: { allowedDomains: ['example.com'] }
            },
            servers: {
                test: {
                    type: 'stdio',
                    command: 'node',
                    sandboxEnabled: true
                }
            }
        }, null, '\t')));
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('fires update when root sandbox changes', async () => {
        const initial = await service.getInstalled();
        assert.strictEqual(initial.length, 1);
        assert.deepStrictEqual(initial[0].rootSandbox, {
            network: { allowedDomains: ['example.com'] }
        });
        let updateCount = 0;
        const updatePromise = new Promise(resolve => disposables.add(service.onDidUpdateMcpServers(e => {
            assert.strictEqual(e.length, 1);
            updateCount++;
            resolve();
        })));
        const updatedSandbox = {
            network: { allowedDomains: ['changed.example.com'] }
        };
        await fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
            sandbox: updatedSandbox,
            servers: {
                test: {
                    type: 'stdio',
                    command: 'node',
                    sandboxEnabled: true
                }
            }
        }, null, '\t')));
        await service.reload();
        await updatePromise;
        const updated = await service.getInstalled();
        assert.strictEqual(updateCount, 1);
        assert.deepStrictEqual(updated[0].rootSandbox, updatedSandbox);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwTWFuYWdlbWVudFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21jcC90ZXN0L2NvbW1vbi9tY3BNYW5hZ2VtZW50U2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUloSSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDNUQsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFdkYsTUFBTSx3QkFBeUIsU0FBUSxrQ0FBa0M7SUFBekU7O1FBRVUsdUJBQWtCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNoQywyQkFBc0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3BD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