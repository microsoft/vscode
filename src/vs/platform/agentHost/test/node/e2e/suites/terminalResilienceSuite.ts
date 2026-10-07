/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { ROOT_STATE_URI, type TerminalState } from '../../../../common/state/sessionState.js';
import { TerminalClaimKind } from '../../../../common/state/protocol/channels-terminal/state.js';
import { terminalText } from '../harness/agentHostE2ETestHarness.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

const { Terminal }: Pick<typeof import('@xterm/headless'), 'Terminal'> = createRequire(import.meta.url)('@xterm/headless');

export function defineTerminalResilienceTests(context: IAgentHostE2ETestContext): void {
	let sequence = 400_000;
	let ordinal = 0;

	async function state(terminal: string): Promise<TerminalState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: terminal });
		return result.snapshot!.state as TerminalState;
	}

	function input(terminal: string, script: string): void {
		context.client.dispatch({
			channel: terminal, clientSeq: sequence++,
			action: { type: ActionType.TerminalInput, data: `node -e "${script}"\r` },
		});
	}

	async function output(terminal: string, marker: string): Promise<string> {
		return retry(async () => {
			const text = terminalText(await state(terminal));
			assert.ok(text.includes(marker), `Terminal has not produced ${marker}; output: ${text}`);
			return text;
		}, 100, 300);
	}

	async function withTerminals(count: number, run: (terminals: readonly { uri: string; workspace: string }[]) => Promise<void>): Promise<void> {
		const clientId = `terminal-resilience-${ordinal++}`;
		await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId });
		const terminals: { uri: string; workspace: string }[] = [];
		try {
			for (let i = 0; i < count; i++) {
				const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'ahp-terminal-resilience-')));
				context.tempDirs.push(workspace);
				const uri = URI.from({ scheme: 'agenthost-terminal', authority: 'e2e', path: `/${generateUuid()}` }).toString();
				await context.client.call('createTerminal', {
					channel: uri,
					claim: { kind: TerminalClaimKind.Client, clientId },
					cwd: URI.file(workspace).toString(),
					cols: 90, rows: 30,
				});
				terminals.push({ uri, workspace });
				await state(uri);
			}
			await run(terminals);
		} finally {
			for (const terminal of terminals) {
				await context.client.call('disposeTerminal', { channel: terminal.uri });
			}
		}
	}

	conformanceTest(context, 'regression coverage: a client-owned terminal launches in its requested working directory', async function () {
		await withTerminals(1, async ([terminal]) => {
			input(terminal.uri, `require('fs').writeFileSync('cwd.txt',process.cwd());console.log('CWD_'+'READY')`);
			await output(terminal.uri, 'CWD_READY');
			const actual = statSync(readFileSync(join(terminal.workspace, 'cwd.txt'), 'utf8'));
			const requested = statSync(terminal.workspace);
			assert.deepStrictEqual({ dev: actual.dev, ino: actual.ino }, { dev: requested.dev, ino: requested.ino });
		});
	});

	conformanceTest(context, 'regression coverage: terminal input preserves UTF-8 bytes for a running child process', async function () {
		await withTerminals(1, async ([terminal]) => {
			// Read PTY input in the child, independently of the shell editor's inherited locale.
			input(terminal.uri, `const fs=require('fs');let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{text+=chunk;if(text.includes('\\n')===false)return;fs.writeFileSync('unicode.txt',text.trim());process.stdin.pause();console.log('UNICODE_'+'DONE')});console.log('INPUT_'+'READY')`);
			await output(terminal.uri, 'INPUT_READY');
			context.client.dispatch({
				channel: terminal.uri, clientSeq: sequence++,
				action: { type: ActionType.TerminalInput, data: 'caf\u00e9\r' },
			});
			await output(terminal.uri, 'UNICODE_DONE');
			assert.strictEqual(readFileSync(join(terminal.workspace, 'unicode.txt'), 'utf8'), 'caf\u00e9');
		});
	});

	conformanceTest(context, 'regression coverage: terminal resizing reaches the real child process', async function () {
		await withTerminals(1, async ([terminal]) => {
			context.client.dispatch({
				channel: terminal.uri, clientSeq: sequence++,
				action: { type: ActionType.TerminalResized, cols: 73, rows: 19 },
			});
			await retry(async () => {
				const current = await state(terminal.uri);
				assert.deepStrictEqual({ cols: current.cols, rows: current.rows }, { cols: 73, rows: 19 });
			}, 50, 100);
			input(terminal.uri, `console.log('SIZE_'+process.stdout.columns+'x'+process.stdout.rows)`);
			await output(terminal.uri, 'SIZE_73x19');
		});
	});

	conformanceTest(context, 'regression coverage: terminal scrollback preserves a large fragmented process output', async function () {
		await withTerminals(1, async ([terminal]) => {
			input(terminal.uri, `console.log('x'.repeat(40000)+'LONG_'+'DONE')`);
			await output(terminal.uri, 'LONG_DONE');
			const current = await state(terminal.uri);
			const disposables = new DisposableStore();
			try {
				const screen = disposables.add(new Terminal({ cols: current.cols, rows: current.rows, scrollback: 5000, allowProposedApi: true }));
				await new Promise<void>(resolve => screen.write(current.content.map(part => part.type === 'command' ? part.output : part.value).join(''), resolve));
				let runLength = 0;
				for (let line = 0; line < screen.buffer.active.length; line++) {
					const text = screen.buffer.active.getLine(line)?.translateToString(true) ?? '';
					runLength += [...text.matchAll(/x{20,}/g)].reduce((length, match) => length + match[0].length, 0);
				}
				assert.strictEqual(runLength, 40000);
			} finally {
				disposables.dispose();
			}
		});
	});

	conformanceTest(context, 'regression coverage: terminal input and output stay isolated between two claimed processes', async function () {
		await withTerminals(2, async ([first, second]) => {
			input(first.uri, `require('fs').writeFileSync('owner.txt','first');console.log('FIRST_'+'DONE')`);
			await output(first.uri, 'FIRST_DONE');
			assert.strictEqual(existsSync(join(second.workspace, 'owner.txt')), false);
			assert.ok(!terminalText(await state(second.uri)).includes('FIRST_DONE'));
			input(second.uri, `require('fs').writeFileSync('owner.txt','second');console.log('SECOND_'+'DONE')`);
			await output(second.uri, 'SECOND_DONE');
			assert.deepStrictEqual({
				first: readFileSync(join(first.workspace, 'owner.txt'), 'utf8'),
				second: readFileSync(join(second.workspace, 'owner.txt'), 'utf8'),
				firstSawSecond: terminalText(await state(first.uri)).includes('SECOND_DONE'),
			}, { first: 'first', second: 'second', firstSawSecond: false });
		});
	});

	conformanceTest(context, 'regression coverage: terminal process output remains readable after an unsubscribed interval', async function () {
		await withTerminals(1, async ([terminal]) => {
			writeFileSync(join(terminal.workspace, 'trigger.txt'), 'before');
			input(terminal.uri, `const fs=require('fs');fs.watchFile('trigger.txt',{interval:50},()=>{fs.unwatchFile('trigger.txt');fs.writeFileSync('witness.txt','done');console.log('LATER_'+'OUTPUT')});console.log('WAIT_'+'READY')`);
			await output(terminal.uri, 'WAIT_READY');
			context.client.notify('unsubscribe', { channel: terminal.uri });
			await context.client.call('listSessions', { channel: ROOT_STATE_URI });
			writeFileSync(join(terminal.workspace, 'trigger.txt'), 'after');
			await retry(async () => assert.ok(existsSync(join(terminal.workspace, 'witness.txt'))), 50, 100);
			const restored = await output(terminal.uri, 'LATER_OUTPUT');
			assert.ok(restored.includes('WAIT_READY'));
		});
	});
}
