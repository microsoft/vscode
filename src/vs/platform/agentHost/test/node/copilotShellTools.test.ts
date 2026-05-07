/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { Disposable, DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { CreateTerminalParams } from '../../common/state/protocol/commands.js';
import type { TerminalClaim, TerminalInfo } from '../../common/state/protocol/state.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { ShellManager, prefixForHistorySuppression, shellTypeForExecutable } from '../../node/copilot/copilotShellTools.js';

class TestAgentHostTerminalManager implements IAgentHostTerminalManager {
	declare readonly _serviceBrand: undefined;

	defaultShell = '/bin/bash';
	readonly created: { params: CreateTerminalParams; options?: { shell?: string; preventShellHistory?: boolean; nonInteractive?: boolean } }[] = [];

	async createTerminal(params: CreateTerminalParams, options?: { shell?: string; preventShellHistory?: boolean; nonInteractive?: boolean }): Promise<void> {
		this.created.push({ params, options: { ...options, shell: options?.shell ?? this.defaultShell } });
	}
	writeInput(): void { }
	onData(): IDisposable { return Disposable.None; }
	onExit(): IDisposable { return Disposable.None; }
	onClaimChanged(): IDisposable { return Disposable.None; }
	onCommandFinished(): IDisposable { return Disposable.None; }
	getContent(): string | undefined { return undefined; }
	getClaim(): TerminalClaim | undefined { return undefined; }
	hasTerminal(): boolean { return false; }
	getExitCode(): number | undefined { return undefined; }
	supportsCommandDetection(): boolean { return false; }
	disposeTerminal(): void { }
	getTerminalInfos(): TerminalInfo[] { return []; }
	getTerminalState(): undefined { return undefined; }
	async getDefaultShell(): Promise<string> { return this.defaultShell; }
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
});
