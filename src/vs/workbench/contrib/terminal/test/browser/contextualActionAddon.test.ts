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
import { ITerminalInstance, ITerminalOutputMatcher } from 'vs/workbench/contrib/terminal/browser/terminal';
import { gitSimilarCommand } from 'vs/workbench/contrib/terminal/browser/terminalBaseContextualActions';
import { ContextualActionAddon, getMatchOptions, MatchActions } from 'vs/workbench/contrib/terminal/browser/xterm/contextualActionAddon';
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
		// if (exitCode) {
		// 	this.handleCommandExecuted();
		// 	this.handleCommandFinished(exitCode, options);
		// } else {
		// 	this.handlePromptStart();
		// 	this.handleCommandStart(options);
		// }
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
		terminalInstance = (
			{
				async sendText(text: string): Promise<void> { }
			} as Partial<ITerminalInstance>
		);
		contextualActionAddon = instantiationService.createInstance(ContextualActionAddon, capabilities);
		xterm.loadAddon(contextualActionAddon);
	});
	suite('registerCommandFinishedListener', () => {
		const expectedMap = new Map();
		suite('gitSimilarCommand', async () => {
			const command = `git sttatus`;
			const output = `git: 'sttatus' is not a git command. See 'git --help'.

			The most similar command is
					status`;
			const exitCode = 1;
			setup(() => {
				expectedMap.set(gitSimilarCommand(terminalInstance as any).commandLineMatcher.toString(), [gitSimilarCommand(terminalInstance as any)]);
				contextualActionAddon.registerCommandFinishedListener(gitSimilarCommand(terminalInstance as any));
			});
			suite('getMatchOptions should return undefined when', async () => {
				test('output does not match', async () => {
					strictEqual(getMatchOptions(createCommand(command, `invalid output`, exitCode), expectedMap), undefined);
				});
				test('command does not match', async () => {
					strictEqual(getMatchOptions(createCommand(`gt sttatus`, output, exitCode), expectedMap), undefined);
				});
				test('exit code does not match', async () => {
					strictEqual(getMatchOptions(createCommand(command, output, 2), expectedMap), undefined);
				});
			});
			test('getMatchOptions should return match', async () => {
				assertMatchOptions(
					getMatchOptions(
						createCommand(command, output, exitCode), expectedMap),
					[
						{
							id: 'terminal.fixGitCommand',
							label: 'Run git status',
							run: true,
							tooltip: 'Run git status',
							enabled: true
						}
					]);
			});
		});
	});
});

function createCommand(command: string, output?: string, exitCode?: number): ITerminalCommand {
	return {
		command,
		exitCode,
		getOutput: (outputMatcher: ITerminalOutputMatcher) => output,
		timestamp: Date.now(),
		hasOutput: () => !!output
	};
}

function assertMatchOptions(actual: MatchActions, expected: { id: string; label: string; run: boolean; tooltip: string; enabled: boolean }[]): void {
	strictEqual(actual?.length, expected.length);
	let index = 0;
	for (const i of actual) {
		const j = expected[index];
		strictEqual(i.id, j.id);
		strictEqual(i.enabled, j.enabled);
		strictEqual(i.label, j.label);
		strictEqual(!!i.run, j.run);
		strictEqual(i.tooltip, j.tooltip);
		index++;
	}
}
