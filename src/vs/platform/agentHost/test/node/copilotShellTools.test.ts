/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import * as platform from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { type ICreateTerminalParams } from '../../common/state/protocol/commands.js';
import { TerminalClaimKind, type ITerminalClaim, type ITerminalInfo, type ITerminalState } from '../../common/state/protocol/state.js';
import { type IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { createShellTools, ShellManager } from '../../node/copilot/copilotShellTools.js';

interface IMockTerminal {
	content: string;
	claim: ITerminalClaim;
	exitCode?: number;
	readonly onData: Emitter<string>;
	readonly onExit: Emitter<number>;
	readonly onClaimChanged: Emitter<ITerminalClaim>;
}

interface IToolResultLike {
	resultType: string;
	textResultForLlm: string;
	error?: string;
}

class MockTerminalManager implements IAgentHostTerminalManager {
	declare readonly _serviceBrand: undefined;

	private readonly _terminals = new Map<string, IMockTerminal>();
	private readonly _store = new DisposableStore();

	onWrite?: (uri: string, data: string) => void;

	constructor(private readonly _initialContent = '') { }

	async createTerminal(params: ICreateTerminalParams): Promise<void> {
		this._terminals.set(params.terminal, {
			content: this._initialContent,
			claim: params.claim ?? { kind: TerminalClaimKind.Client, clientId: '' },
			onData: this._store.add(new Emitter<string>()),
			onExit: this._store.add(new Emitter<number>()),
			onClaimChanged: this._store.add(new Emitter<ITerminalClaim>()),
		});
	}

	writeInput(uri: string, data: string): void {
		this.onWrite?.(uri, data);
	}

	onData(uri: string, cb: (data: string) => void): IDisposable {
		return this._terminals.get(uri)?.onData.event(cb) ?? toDisposable(() => { });
	}

	onExit(uri: string, cb: (exitCode: number) => void): IDisposable {
		return this._terminals.get(uri)?.onExit.event(cb) ?? toDisposable(() => { });
	}

	onClaimChanged(uri: string, cb: (claim: ITerminalClaim) => void): IDisposable {
		return this._terminals.get(uri)?.onClaimChanged.event(cb) ?? toDisposable(() => { });
	}

	getContent(uri: string): string | undefined {
		return this._terminals.get(uri)?.content;
	}

	getClaim(uri: string): ITerminalClaim | undefined {
		return this._terminals.get(uri)?.claim;
	}

	hasTerminal(uri: string): boolean {
		return this._terminals.has(uri);
	}

	getExitCode(uri: string): number | undefined {
		return this._terminals.get(uri)?.exitCode;
	}

	disposeTerminal(uri: string): void {
		this._terminals.delete(uri);
	}

	getTerminalInfos(): ITerminalInfo[] {
		return [];
	}

	getTerminalState(): ITerminalState | undefined {
		return undefined;
	}

	setContent(uri: string, content: string): void {
		const terminal = this._terminals.get(uri);
		assert.ok(terminal);
		terminal.content = content;
	}

	fireData(uri: string, data: string): void {
		this._terminals.get(uri)?.onData.fire(data);
	}

	fireExit(uri: string, exitCode: number): void {
		const terminal = this._terminals.get(uri);
		if (!terminal) {
			return;
		}
		terminal.exitCode = exitCode;
		terminal.onExit.fire(exitCode);
	}

	dispose(): void {
		this._store.dispose();
		this._terminals.clear();
	}
}

suite('copilotShellTools', () => {
	const disposables = new DisposableStore();
	const sessionUri = URI.parse('agenthost://test/session');
	const logService = new NullLogService();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function getPrimaryShellTool(terminalManager: MockTerminalManager) {
		const shellManager = disposables.add(new ShellManager(sessionUri, terminalManager, logService));
		const toolName = platform.isWindows ? 'powershell' : 'bash';
		const tool = createShellTools(shellManager, terminalManager, logService).find(candidate => candidate.name === toolName);
		assert.ok(tool, `Expected ${toolName} tool to exist`);
		return tool;
	}

	test('keeps trimmed shell output when sentinel arrives after scrollback rollover', async () => {
		const terminalManager = new MockTerminalManager('A'.repeat(90_000));
		disposables.add(toDisposable(() => terminalManager.dispose()));

		const tool = getPrimaryShellTool(terminalManager);

		terminalManager.onWrite = (uri, data) => {
			const sentinelId = data.match(/<<<COPILOT_SENTINEL_([A-Za-z0-9]+)_EXIT_/)?.[1];
			assert.ok(sentinelId, 'expected sentinel command in shell input');
			const sentinel = `<<<COPILOT_SENTINEL_${sentinelId}_EXIT_0>>>`;
			terminalManager.setContent(uri, `${'B'.repeat(80_000)}${sentinel}`);
			terminalManager.fireData(uri, sentinel);
		};

		const result = await tool!.handler({ command: 'echo hello', timeout: 50 }, { toolCallId: 'tool-call-1' } as never) as IToolResultLike;

		assert.strictEqual(result.resultType, 'success');
		assert.ok(result.textResultForLlm.includes('Exit code: 0'));
		assert.ok(result.textResultForLlm.includes('BBBB'));
	});

	test('keeps trimmed shell output in timeout results after scrollback rollover', async () => {
		const terminalManager = new MockTerminalManager('A'.repeat(90_000));
		disposables.add(toDisposable(() => terminalManager.dispose()));

		const tool = getPrimaryShellTool(terminalManager);

		terminalManager.onWrite = (uri) => {
			terminalManager.setContent(uri, 'B'.repeat(80_000));
		};

		const result = await tool!.handler({ command: 'echo hello', timeout: 1 }, { toolCallId: 'tool-call-2' } as never) as IToolResultLike;

		assert.strictEqual(result.resultType, 'failure');
		assert.strictEqual(result.error, 'timeout');
		assert.ok(result.textResultForLlm.includes('Partial output:'));
		assert.ok(result.textResultForLlm.includes('BBBB'));
	});
});
