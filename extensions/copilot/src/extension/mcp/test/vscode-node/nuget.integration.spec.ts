/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ILogService } from '../../../../platform/log/common/logService';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { ITestingServicesAccessor, TestingServiceCollection } from '../../../../platform/test/node/services';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { IMcpStdioServerConfiguration, NuGetMcpSetup } from '../../vscode-node/nuget';
import { CommandExecutor, ICommandExecutor } from '../../vscode-node/util';
import { FixtureFetcherService } from './util';

const RUN_DOTNET_CLI_TESTS = !!process.env['CI'] && !process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'];

describe.runIf(RUN_DOTNET_CLI_TESTS).skip('get nuget MCP server info using dotnet CLI', { timeout: 30_000 }, () => {
	let testingServiceCollection: TestingServiceCollection;
	let accessor: ITestingServicesAccessor;
	let logService: ILogService;
	let fetcherService: IFetcherService;
	let commandExecutor: ICommandExecutor;
	let nuget: NuGetMcpSetup;

	beforeEach(() => {
		testingServiceCollection = createExtensionUnitTestingServices();
		accessor = testingServiceCollection.createTestingAccessor();
		logService = accessor.get(ILogService);
		fetcherService = new FixtureFetcherService();
		commandExecutor = new CommandExecutor();
		nuget = new NuGetMcpSetup(
			logService,
			fetcherService,
			commandExecutor,
			{ command: 'dotnet', args: [] }, // allow dotnet command to be overridden for testing
			path.join(__dirname, 'fixtures', 'nuget') // file based package source for testing
		);
	});

	it('returns mapped server.json for original schema', async () => {
		const result = await nuget.getNuGetPackageMetadata('Knapcode.SampleMcpServer');
		expect(result.state).toBe('ok');
		if (result.state === 'ok') {
			expect(result.getMcpServer).toBeDefined();
			if (result.getMcpServer) {
				const mcpServer = await result.getMcpServer(Promise.resolve());
				expect(mcpServer).toBeDefined();
				const config = mcpServer!.config as Omit<IMcpStdioServerConfiguration, 'type'>;
				expect(config.command).toBe('dnx');
				expect(config.env).toEqual({ 'WEATHER_CHOICES': '${input:weather_choices}' });
				expect(config.args).toEqual(['Knapcode.SampleMcpServer@0.6.0-beta', '--yes', '--', 'mcp', 'start']);
			} else {
				expect.fail();
			}
		} else {
			expect.fail();
		}
	});

	it('returns mapped server.json for 2025-09-29 schema', async () => {
		const result = await nuget.getNuGetPackageMetadata('BaseTestPackage.McpServer');
		expect(result.state).toBe('ok');
		if (result.state === 'ok') {
			expect(result.getMcpServer).toBeDefined();
			if (result.getMcpServer) {
				const mcpServer = await result.getMcpServer(Promise.resolve());
				expect(mcpServer).toBeDefined();
				const config = mcpServer!.config as Omit<IMcpStdioServerConfiguration, 'type'>;
				expect(config.command).toBe('dnx');
				expect(config.env).toEqual({ 'WEATHER_CHOICES': '${input:weather_choices}' });
				expect(config.args).toEqual(['BaseTestPackage.McpServer@0.1.0-beta', '--yes', '--', 'mcp', 'start']);
			} else {
				expect.fail();
			}
		} else {
			expect.fail();
		}
	});

	it('returns package metadata', async () => {
		const result = await nuget.getNuGetPackageMetadata('basetestpackage.dotnettool');
		expect(result.state).toBe('ok');
		if (result.state === 'ok') {
			expect(result.name).toBe('BaseTestPackage.DotnetTool');
			expect(result.version).toBe('1.0.0');
		} else {
			expect.fail();
		}
	});

	it('handles missing package', async () => {
		const result = await nuget.getNuGetPackageMetadata('BaseTestPackage.DoesNotExist');
		expect(result.state).toBe('error');
		if (result.state === 'error') {
			expect(result.error).toBeDefined();
			expect(result.errorType).toBe('NotFound');
		} else {
			expect.fail();
		}
	});

	it('handles missing dotnet', async () => {
		nuget.dotnet.command = 'dotnet-missing';
		const result = await nuget.getNuGetPackageMetadata('Knapcode.SampleMcpServer');
		expect(result.state).toBe('error');
		if (result.state === 'error') {
			expect(result.errorType).toBe('MissingCommand');
			expect(result.helpUriLabel).toBe('Install .NET SDK');
			expect(result.helpUri).toBe('https://aka.ms/vscode-mcp-install/dotnet');
		} else {
			expect.fail();
		}
	});

	it('handles old dotnet version', async () => {
		nuget.dotnet.command = 'node';
		nuget.dotnet.args = ['-e', 'console.log("9.0.0")', '--'];
		const result = await nuget.getNuGetPackageMetadata('Knapcode.SampleMcpServer');
		expect(result.state).toBe('error');
		if (result.state === 'error') {
			expect(result.errorType).toBe('BadCommandVersion');
			expect(result.helpUriLabel).toBe('Update .NET SDK');
			expect(result.helpUri).toBe('https://aka.ms/vscode-mcp-install/dotnet');
		} else {
			expect.fail();
		}
	});
});
