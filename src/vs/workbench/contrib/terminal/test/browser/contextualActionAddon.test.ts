/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IHandleCommandOptions, ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { CommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/commandDetectionCapability';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { gitSimilarCommand } from 'vs/workbench/contrib/terminal/browser/terminalBaseContextualActions';
import { ContextualActionAddon, getMatchOptions } from 'vs/workbench/contrib/terminal/browser/xterm/contextualActionAddon';
import { IDecoration, IDecorationOptions, Terminal } from 'xterm';

class TestTerminal extends Terminal {
	override registerDecoration(decorationOptions: IDecorationOptions): IDecoration | undefined {
		if (decorationOptions.marker.isDisposed) {
			return undefined;
		}
		const element = document.createElement('div');
		return { marker: decorationOptions.marker, element, onDispose: () => { }, isDisposed: false, dispose: () => { }, onRender: (element: HTMLElement) => { return element; } } as unknown as IDecoration;
	}
}

class TestCommandDetectionCapability extends CommandDetectionCapability {
	triggerEvent(exitCode?: number, options?: IHandleCommandOptions): void {
		if (exitCode) {
			this.handleCommandExecuted();
			this.handleCommandFinished(exitCode, options);
		} else {
			this.handlePromptStart();
			this.handleCommandStart(options);
		}
	}
}

suite('ContextualActionAddon', () => {
	let contextualActionAddon: ContextualActionAddon;
	let xterm: TestTerminal;
	let terminalInstance: Partial<ITerminalInstance>;
	let commandDetection: TestCommandDetectionCapability;

	setup(() => {
		const instantiationService = new TestInstantiationService();
		xterm = new TestTerminal({
			allowProposedApi: true,
			cols: 80,
			rows: 30
		});
		const capabilities = new TerminalCapabilityStore();
		instantiationService.stub(ILogService, new NullLogService());
		commandDetection = instantiationService.createInstance(TestCommandDetectionCapability, xterm);
		capabilities.add(TerminalCapability.CommandDetection, commandDetection);
		instantiationService.stub(IContextMenuService, instantiationService.createInstance(ContextMenuService));
		terminalInstance = ({
			async sendText(text: string): Promise<void> {
			}
		} as Partial<ITerminalInstance>);
		contextualActionAddon = instantiationService.createInstance(ContextualActionAddon, capabilities);
		xterm.loadAddon(contextualActionAddon);
	});
	suite('registerCommandFinishedListener', () => {
		suite('gitSimilarCommand', async () => {
			const expectedMap = new Map();
			expectedMap.set(gitSimilarCommand(terminalInstance as any).commandLineMatcher.toString(), [gitSimilarCommand(terminalInstance as any)]);
			const beforeEach = async () => {
				commandDetection.triggerEvent();
				commandDetection.triggerEvent(1);
				contextualActionAddon.registerCommandFinishedListener(gitSimilarCommand(terminalInstance as any));
			};
			suite('getMatchOptions should return undefined when', async () => {
				test('output does not match', async () => {
					await beforeEach();
					const command = {
						command: 'git sttatus',
						exitCode: 1,
						getOutput: () => `fsdfsdfs`,
						actionOptions: []
					} as Partial<ITerminalCommand>;
					const result = getMatchOptions(command as any, expectedMap);
					strictEqual(result, undefined);
				});
				test('command does not match', async () => {
					await beforeEach();
					const command = {
						command: 'gt status',
						exitCode: 1,
						getOutput: () => `fsdfsdfs`,
						actionOptions: []
					} as Partial<ITerminalCommand>;
					const result = getMatchOptions(command as any, expectedMap);
					strictEqual(result, undefined);
				});
				test('exit code does not match', async () => {
					await beforeEach();
					const command = {
						command: 'gt status',
						exitCode: 2,
						getOutput: () => `fsdfsdfs`,
						actionOptions: []
					} as Partial<ITerminalCommand>;
					const result = getMatchOptions(command as any, expectedMap);
					strictEqual(result, undefined);
				});
			});
			test('getMatchOptions should return match', async () => {
				await beforeEach();
				const command = {
					command: 'git sttatus',
					exitCode: 1,
					getOutput: () => `git: 'sttatus' is not a git command. See 'git --help'.

					The most similar command is
							status`,
					actionOptions: []
				} as Partial<ITerminalCommand>;
				const result = getMatchOptions(command as any, expectedMap);
				strictEqual(result?.length, 1);
				strictEqual(result?.[0].enabled, true);
				strictEqual(result?.[0], `terminal.fixGitCommand`);
				strictEqual(result?.[0].label, 'Run git status');
				strictEqual(result?.[0].tooltip, `Run git status`);
			});
		});
	});
});
