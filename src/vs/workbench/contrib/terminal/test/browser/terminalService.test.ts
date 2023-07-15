/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fail } from 'assert';
import { Emitter } from 'vs/base/common/event';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { TerminalService } from 'vs/workbench/contrib/terminal/browser/terminalService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestEditorService, TestLifecycleService, TestRemoteAgentService, TestTerminalEditorService, TestTerminalGroupService, TestTerminalInstanceService, TestTerminalProfileService } from 'vs/workbench/test/browser/workbenchTestServices';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { ITerminalProfileService } from 'vs/workbench/contrib/terminal/common/terminal';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

suite('Workbench - TerminalService', () => {
	let instantiationService: TestInstantiationService;
	let terminalService: TerminalService;
	let configurationService: TestConfigurationService;
	let dialogService: TestDialogService;

	setup(async () => {
		dialogService = new TestDialogService();
		configurationService = new TestConfigurationService({
			terminal: {
				integrated: {
					fontWeight: 'normal'
				}
			}
		});

		instantiationService = new TestInstantiationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, instantiationService.createInstance(ContextKeyService));
		instantiationService.stub(ILifecycleService, new TestLifecycleService());
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IEditorService, new TestEditorService());
		instantiationService.stub(ITerminalEditorService, new TestTerminalEditorService());
		instantiationService.stub(ITerminalGroupService, new TestTerminalGroupService());
		instantiationService.stub(ITerminalInstanceService, new TestTerminalInstanceService());
		instantiationService.stub(ITerminalProfileService, new TestTerminalProfileService());
		instantiationService.stub(IRemoteAgentService, new TestRemoteAgentService());
		instantiationService.stub(IRemoteAgentService, 'getConnection', null);
		instantiationService.stub(IDialogService, dialogService);

		terminalService = instantiationService.createInstance(TerminalService);
		instantiationService.stub(ITerminalService, terminalService);
	});

	teardown(() => {
		instantiationService.dispose();
	});

	suite('safeDisposeTerminal', () => {
		let onExitEmitter: Emitter<number | undefined>;

		setup(() => {
			onExitEmitter = new Emitter<number | undefined>();
		});

		test('should not show prompt when confirmOnKill is never', async () => {
			setConfirmOnKill(configurationService, 'never');
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Editor,
					hasChildProcesses: true,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Panel,
					hasChildProcesses: true,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
		});
		test('should not show prompt when any terminal editor is closed (handled by editor itself)', async () => {
			setConfirmOnKill(configurationService, 'editor');
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Editor,
					hasChildProcesses: true,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
			setConfirmOnKill(configurationService, 'always');
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Editor,
					hasChildProcesses: true,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
		});
		test('should not show prompt when confirmOnKill is editor and panel terminal is closed', async () => {
			setConfirmOnKill(configurationService, 'editor');
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Panel,
					hasChildProcesses: true,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
		});
		test('should show prompt when confirmOnKill is panel and panel terminal is closed', async () => {
			setConfirmOnKill(configurationService, 'panel');
			// No child process cases
			dialogService.setConfirmResult({ confirmed: false });
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Panel,
					hasChildProcesses: false,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
			dialogService.setConfirmResult({ confirmed: true });
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Panel,
					hasChildProcesses: false,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
			// Child process cases
			dialogService.setConfirmResult({ confirmed: false });
			await terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				dispose: () => fail()
			} as Partial<ITerminalInstance> as any);
			dialogService.setConfirmResult({ confirmed: true });
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Panel,
					hasChildProcesses: true,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
		});
		test('should show prompt when confirmOnKill is always and panel terminal is closed', async () => {
			setConfirmOnKill(configurationService, 'always');
			// No child process cases
			dialogService.setConfirmResult({ confirmed: false });
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Panel,
					hasChildProcesses: false,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
			dialogService.setConfirmResult({ confirmed: true });
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Panel,
					hasChildProcesses: false,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
			// Child process cases
			dialogService.setConfirmResult({ confirmed: false });
			await terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				dispose: () => fail()
			} as Partial<ITerminalInstance> as any);
			dialogService.setConfirmResult({ confirmed: true });
			await new Promise<void>(r => {
				terminalService.safeDisposeTerminal({
					target: TerminalLocation.Panel,
					hasChildProcesses: true,
					onExit: onExitEmitter.event,
					dispose: () => r()
				} as Partial<ITerminalInstance> as any);
			});
		});
	});
});

async function setConfirmOnKill(configurationService: TestConfigurationService, value: 'never' | 'always' | 'panel' | 'editor') {
	await configurationService.setUserConfiguration('terminal', { integrated: { confirmOnKill: value } });
	configurationService.onDidChangeConfigurationEmitter.fire({
		affectsConfiguration: () => true,
		affectedKeys: ['terminal.integrated.confirmOnKill']
	} as any);
}
