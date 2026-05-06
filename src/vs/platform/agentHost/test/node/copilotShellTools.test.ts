/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { CreateTerminalParams } from '../../common/state/protocol/commands.js';
import type { TerminalClaim, TerminalInfo } from '../../common/state/protocol/state.js';
import { formatTerminalCommandInput, IAgentHostTerminalManager, type IWriteCommandInputOptions } from '../../node/agentHostTerminalManager.js';
import { createShellTools, ShellManager, prefixForHistorySuppression, shellTypeForExecutable } from '../../node/copilot/copilotShellTools.js';

class TestAgentHostTerminalManager implements IAgentHostTerminalManager {
	declare readonly _serviceBrand: undefined;

	defaultShell = '/bin/bash';
	terminalExists = false;
	supportsCommandDetectionValue = false;
	content = '';
	renderedContent: string | undefined;
	readonly created: { params: CreateTerminalParams; options?: { shell?: string; preventShellHistory?: boolean; nonInteractive?: boolean } }[] = [];
	readonly rawInputs: { uri: string; data: string }[] = [];
	readonly commandInputs: { uri: string; data: string; options?: IWriteCommandInputOptions }[] = [];
	private readonly _onExitEmitter = new Emitter<number>();
	private readonly _terminals = new Set<string>();

	async createTerminal(params: CreateTerminalParams, options?: { shell?: string; preventShellHistory?: boolean; nonInteractive?: boolean }): Promise<void> {
		this.created.push({ params, options: { ...options, shell: options?.shell ?? this.defaultShell } });
		this._terminals.add(params.terminal);
	}
	writeInput(uri: string, data: string): void {
		this.rawInputs.push({ uri, data });
	}
	writeCommandInput(uri: string, data: string, options?: IWriteCommandInputOptions): void {
		this.commandInputs.push({ uri, data, options });
	}
	onData(): IDisposable { return Disposable.None; }
	onExit(_uri: string, cb: (exitCode: number) => void): IDisposable { return this._onExitEmitter.event(cb); }
	onClaimChanged(): IDisposable { return Disposable.None; }
	onCommandFinished(): IDisposable { return Disposable.None; }
	getContent(): string | undefined { return this.content; }
	async getRenderedContent(): Promise<string | undefined> { return this.renderedContent; }
	isBracketedPasteMode(): boolean { return false; }
	getClaim(): TerminalClaim | undefined { return undefined; }
	hasTerminal(uri: string): boolean { return this.terminalExists && this._terminals.has(uri); }
	getExitCode(): number | undefined { return undefined; }
	supportsCommandDetection(): boolean { return this.supportsCommandDetectionValue; }
	disposeTerminal(): void { }
	getTerminalInfos(): TerminalInfo[] { return []; }
	getTerminalState(): undefined { return undefined; }
	async getDefaultShell(): Promise<string> { return this.defaultShell; }
	fireExit(exitCode: number): void { this._onExitEmitter.fire(exitCode); }
}

suite('CopilotShellTools', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createServices(): { instantiationService: IInstantiationService; terminalManager: TestAgentHostTerminalManager } {
		const terminalManager = new TestAgentHostTerminalManager();
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IAgentHostTerminalManager, terminalManager);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		services.set(IInstantiationService, instantiationService);
		return { instantiationService, terminalManager };
	}

	test('uses session working directory for created shells', async () => {
		const { instantiationService, terminalManager } = createServices();
		const worktreePath = URI.file('/workspace/worktree').fsPath;
		const explicitCwd = URI.file('/explicit/cwd').fsPath;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), URI.file(worktreePath)));

		(await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1')).dispose();
		(await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2', explicitCwd)).dispose();

		assert.deepStrictEqual(terminalManager.created.map(c => c.params.cwd), [
			worktreePath,
			explicitCwd,
		]);
	});

	test('opts every managed shell into shell-history suppression and non-interactive mode', async () => {
		const { instantiationService, terminalManager } = createServices();
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));

		await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1');

		assert.strictEqual(terminalManager.created.length, 1);
		assert.strictEqual(terminalManager.created[0].options?.preventShellHistory, true);
		assert.strictEqual(terminalManager.created[0].options?.nonInteractive, true);
	});

	test('uses the executable resolved by the terminal manager', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.defaultShell = '/custom/path/to/pwsh';
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));

		await shellManager.getOrCreateShell('powershell', 'turn-1', 'tool-1');

		assert.strictEqual(terminalManager.created[0].options?.shell, '/custom/path/to/pwsh');
	});

	test('prefixForHistorySuppression prepends a space for POSIX shells, no-op for PowerShell', () => {
		assert.strictEqual(prefixForHistorySuppression('bash'), ' ');
		assert.strictEqual(prefixForHistorySuppression('powershell'), '');
	});

	test('formatTerminalCommandInput uses bracketed paste for multiline input only when enabled', () => {
		assert.strictEqual(
			formatTerminalCommandInput('echo one\necho two', { addNewLine: true, forceBracketedPaste: true }, true),
			'\x1b[200~echo one\recho two\x1b[201~\r'
		);
		assert.strictEqual(
			formatTerminalCommandInput('echo one\necho two', { addNewLine: true, forceBracketedPaste: true }, false),
			'echo one\recho two\r'
		);
		assert.strictEqual(
			formatTerminalCommandInput('hello', { forceBracketedPaste: true }, true),
			'hello'
		);
	});

	test('shellTypeForExecutable maps known shell basenames and falls back to platform default', () => {
		assert.deepStrictEqual([
			shellTypeForExecutable('C:\\Program Files\\PowerShell\\7\\pwsh.exe'),
			shellTypeForExecutable('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'),
			shellTypeForExecutable('/usr/bin/bash'),
			shellTypeForExecutable('/usr/bin/zsh'),
			shellTypeForExecutable('/bin/sh'),
		], ['powershell', 'powershell', 'bash', 'bash', 'bash']);

		// Unknown shells fall through to the platform default — just assert it's one of the known types.
		const unknownDefault = shellTypeForExecutable('C:\\Windows\\System32\\cmd.exe');
		assert.ok(unknownDefault === 'bash' || unknownDefault === 'powershell');
	});

	test('getOrCreateShell reuses an idle shell after the reference is disposed', async () => {
		const terminalManager = new TestAgentHostTerminalManager();
		// Pretend created terminals exist and are still running.
		(terminalManager as unknown as { hasTerminal: () => boolean }).hasTerminal = () => true;
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IAgentHostTerminalManager, terminalManager);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		services.set(IInstantiationService, instantiationService);
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));

		const first = await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1');
		first.dispose();
		const second = await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2');

		assert.strictEqual(second.object.id, first.object.id, 'should reuse idle shell');
		assert.strictEqual(terminalManager.created.length, 1);
		second.dispose();
	});

	test('getOrCreateShell creates a new shell when the existing reference is still held', async () => {
		const terminalManager = new TestAgentHostTerminalManager();
		(terminalManager as unknown as { hasTerminal: () => boolean }).hasTerminal = () => true;
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IAgentHostTerminalManager, terminalManager);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		services.set(IInstantiationService, instantiationService);
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));

		const first = await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1');
		const second = await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2');

		assert.notStrictEqual(second.object.id, first.object.id, 'should create a new shell when existing is busy');
		assert.strictEqual(terminalManager.created.length, 2);
		first.dispose();
		second.dispose();
	});

	test('primary shell tool writes commands through command-input helper', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.terminalExists = true;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		await bashTool.handler({ command: 'echo one\necho two', timeout: 1 }, { toolCallId: 'tool-1' } as never);

		assert.strictEqual(terminalManager.commandInputs[0].data, ' echo one\necho two');
		assert.deepStrictEqual(terminalManager.commandInputs[0].options, { addNewLine: true, forceBracketedPaste: true });
		assert.ok(terminalManager.commandInputs[1].data.startsWith('echo "<<<COPILOT_SENTINEL_'));
		assert.deepStrictEqual(terminalManager.commandInputs[1].options, { addNewLine: true });
	});

	test('write shell tool sends interactive input without command formatting', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.terminalExists = true;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const shellRef = await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1');
		shellRef.dispose();
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const writeTool = tools.find(tool => tool.name === 'write_bash');
		assert.ok(writeTool);

		const result = await writeTool.handler({ command: 'answer one\nanswer two' }, { toolCallId: 'tool-2' } as never);

		assert.strictEqual((result as { resultType: string }).resultType, 'success');
		assert.strictEqual(terminalManager.rawInputs[0].data, 'answer one\nanswer two');
		assert.strictEqual(terminalManager.commandInputs.length, 0);
	});

	test('read shell tool prefers rendered content with raw fallback', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.terminalExists = true;
		terminalManager.content = 'raw output';
		terminalManager.renderedContent = 'rendered output';
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const shellRef = await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1');
		shellRef.dispose();
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const readTool = tools.find(tool => tool.name === 'read_bash');
		assert.ok(readTool);

		const result = await readTool.handler({}, { toolCallId: 'tool-2' } as never);

		assert.strictEqual((result as { textResultForLlm: string }).textResultForLlm, 'rendered output');
	});

	test('shell integration timeout uses raw output sliced from command start', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.terminalExists = true;
		terminalManager.supportsCommandDetectionValue = true;
		terminalManager.content = 'old output\n';
		terminalManager.renderedContent = 'old rendered screen\nnew partial';
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const resultPromise = bashTool.handler({ command: 'sleep 10', timeout: 20 }, { toolCallId: 'tool-1' } as never);
		setTimeout(() => terminalManager.content = 'old output\nnew partial', 0);
		const result = await resultPromise;

		const text = (result as { textResultForLlm: string }).textResultForLlm;
		assert.ok(text.includes('new partial'));
		assert.ok(!text.includes('old output'));
		assert.ok(!text.includes('old rendered screen'));
	});
});
