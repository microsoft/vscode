/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { getShellIntegrationInjection } from '../../../platform/terminal/node/terminalEnvironment.js';
import { ShellIntegrationInjectionFailureReason } from '../../../platform/terminal/common/terminal.js';

suite('Terminal Environment - Git Bash HOME Path Fix', () => {
	test('should not enable environment reporting for bash.exe when windowsUseConptyDll is true', async () => {
		const shellLaunchConfig = {
			executable: 'bash.exe',
			args: [],
			shellIntegrationEnvironmentReporting: true
		};
		
		const options = {
			shellIntegration: { enabled: true },
			windowsUseConptyDll: true,
			windowsEnableConpty: true
		};
		
		const env = {};
		
		const mockLogService = {
			warn: () => {},
			error: () => {}
		};
		
		const mockProductService = {
			quality: 'stable'
		};
		
		const result = await getShellIntegrationInjection(
			shellLaunchConfig,
			options,
			env,
			mockLogService,
			mockProductService,
			true // skipStickyBit for tests
		);
		
		if (result.type === 'injection') {
			// Environment reporting should NOT be enabled for bash.exe, so VSCODE_SHELL_ENV_REPORTING should not be set
			strictEqual(result.envMixin['VSCODE_SHELL_ENV_REPORTING'], undefined, 
				'VSCODE_SHELL_ENV_REPORTING should not be set for bash.exe to prevent HOME path corruption');
		}
	});
	
	test('should not enable environment reporting for bash.exe when only windowsUseConptyDll is true', async () => {
		const shellLaunchConfig = {
			executable: 'bash.exe',
			args: [],
			shellIntegrationEnvironmentReporting: true
		};
		
		const options = {
			shellIntegration: { enabled: true },
			windowsUseConptyDll: true,
			windowsEnableConpty: false
		};
		
		const env = {};
		
		const mockLogService = {
			warn: () => {},
			error: () => {}
		};
		
		const mockProductService = {
			quality: 'stable'
		};
		
		const result = await getShellIntegrationInjection(
			shellLaunchConfig,
			options,
			env,
			mockLogService,
			mockProductService,
			true // skipStickyBit for tests
		);
		
		if (result.type === 'injection') {
			// Environment reporting should NOT be enabled for bash.exe, so VSCODE_SHELL_ENV_REPORTING should not be set
			strictEqual(result.envMixin['VSCODE_SHELL_ENV_REPORTING'], undefined, 
				'VSCODE_SHELL_ENV_REPORTING should not be set for bash.exe even when windowsUseConptyDll is true');
		}
	});
	
	test('should enable environment reporting for powershell.exe when windowsUseConptyDll is true', async () => {
		const shellLaunchConfig = {
			executable: 'powershell.exe',
			args: [],
			shellIntegrationEnvironmentReporting: true
		};
		
		const options = {
			shellIntegration: { enabled: true },
			windowsUseConptyDll: true,
			windowsEnableConpty: true
		};
		
		const env = {};
		
		const mockLogService = {
			warn: () => {},
			error: () => {}
		};
		
		const mockProductService = {
			quality: 'stable'
		};
		
		const result = await getShellIntegrationInjection(
			shellLaunchConfig,
			options,
			env,
			mockLogService,
			mockProductService,
			true // skipStickyBit for tests
		);
		
		if (result.type === 'injection') {
			// Environment reporting SHOULD be enabled for powershell.exe
			strictEqual(result.envMixin['VSCODE_SHELL_ENV_REPORTING'], 'PATH,VIRTUAL_ENV,HOME,SHELL,PWD', 
				'VSCODE_SHELL_ENV_REPORTING should be set for powershell.exe');
		}
	});
});