/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ImmortalReference } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import type { ITerminalCommand } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import type { ICurrentPartialCommand } from '../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import type { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import type { IDetachedTerminalInstance, ITerminalService } from '../../browser/terminal.js';
import { DetachedTerminalCommandMirror, getCommandOutputSnapshot } from '../../browser/chatTerminalCommandMirror.js';
import type { XtermTerminal } from '../../browser/xterm/xtermTerminal.js';

class TestMarker {
	public isDisposed = false;
	public readonly onDispose: Event<void>;

	constructor(
		public readonly id: number,
		public readonly line: number
	) {
		this.onDispose = new Emitter<void>().event;
	}

	dispose(): void {
		this.isDisposed = true;
	}
}

class TestRawTerminal {
	public buffer = {
		active: {
			baseY: 0,
			cursorY: 0
		}
	};

	public onCursorMove: Event<void> = Event.None;
	public onLineFeed: Event<void> = Event.None;
	public onWriteParsed: Event<void> = Event.None;
	public onData: Event<string> = Event.None;

	constructor(private readonly _startLine: number = 0) { }

	registerMarker(_offset: number): IXtermMarker | undefined {
		return new TestMarker(1, this._startLine) as unknown as IXtermMarker;
	}
}

class TestXtermTerminal {
	public readonly raw: any;
	public nextResult: string | undefined = '';
	public shouldThrow = false;
	public lastCall:
		| { start: IXtermMarker; end: IXtermMarker; includeCursor: boolean }
		| undefined;

	constructor(raw?: any) {
		this.raw = raw;
	}

	async getRangeAsVT(start: IXtermMarker, end: IXtermMarker, includeCursor: boolean): Promise<string | undefined> {
		if (this.shouldThrow) {
			throw new Error('getRangeAsVT error');
		}
		this.lastCall = { start, end, includeCursor };
		return this.nextResult;
	}
}

function createCommand(executedMarker: IXtermMarker | undefined, endMarker: IXtermMarker | undefined): ITerminalCommand {
	const command = {
		executedMarker,
		endMarker
	} as unknown as ITerminalCommand;
	return command;
}

suite('Workbench - ChatTerminalCommandMirror', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('getCommandOutputSnapshot', () => {
		test('returns undefined when end marker is missing', async () => {
			const xterm = new TestXtermTerminal() as unknown as XtermTerminal;
			const command = createCommand(undefined, undefined);

			const result = await getCommandOutputSnapshot(xterm, command);
			strictEqual(result, undefined);
		});

		test('uses executed marker when available', async () => {
			const xtermImpl = new TestXtermTerminal();
			xtermImpl.nextResult = 'output';
			const xterm = xtermImpl as unknown as XtermTerminal;

			const executedMarker = new TestMarker(1, 10) as unknown as IXtermMarker;
			const endMarker = new TestMarker(2, 15) as unknown as IXtermMarker;
			const command = createCommand(executedMarker, endMarker);

			const result = await getCommandOutputSnapshot(xterm, command);

			strictEqual(result?.text, 'output');
			// lineCount is derived from marker lines: (endMarker.line - 1) - executedMarker.line + 1
			strictEqual(result?.lineCount, 5);
			deepStrictEqual(xtermImpl.lastCall, {
				start: executedMarker,
				end: endMarker,
				includeCursor: true
			});
		});

		test('falls back to snapshot when executed marker is missing', async () => {
			const raw = new TestRawTerminal(5);
			const xtermImpl = new TestXtermTerminal(raw);
			xtermImpl.nextResult = 'snapshot';
			const xterm = xtermImpl as unknown as XtermTerminal;

			const endMarker = new TestMarker(2, 8) as unknown as IXtermMarker;
			const command = createCommand(undefined, endMarker);

			const result = await getCommandOutputSnapshot(xterm, command);

			strictEqual(result?.text, 'snapshot');
			// lineCount is derived from marker lines: (endMarker.line - 1) - startLine + 1
			strictEqual(result?.lineCount, 3);
		});

		test('logs and returns undefined when fallback snapshot throws', async () => {
			const raw = new TestRawTerminal(5);
			const xtermImpl = new TestXtermTerminal(raw);
			xtermImpl.shouldThrow = true;
			const xterm = xtermImpl as unknown as XtermTerminal;

			const endMarker = new TestMarker(2, 8) as unknown as IXtermMarker;
			const command = createCommand(undefined, endMarker);

			const logged: { reason: string; error: unknown }[] = [];
			const result = await getCommandOutputSnapshot(xterm, command, (reason, error) => {
				logged.push({ reason, error });
			});

			strictEqual(result, undefined);
			strictEqual(logged.length, 1);
			strictEqual(logged[0].reason, 'fallback');
		});

		test('logs and returns undefined when primary snapshot throws', async () => {
			const xtermImpl = new TestXtermTerminal();
			xtermImpl.shouldThrow = true;
			const xterm = xtermImpl as unknown as XtermTerminal;

			const executedMarker = new TestMarker(1, 10) as unknown as IXtermMarker;
			const endMarker = new TestMarker(2, 12) as unknown as IXtermMarker;
			const command = createCommand(executedMarker, endMarker);

			const logged: { reason: string; error: unknown }[] = [];
			const result = await getCommandOutputSnapshot(xterm, command, (reason, error) => {
				logged.push({ reason, error });
			});

			strictEqual(result, undefined);
			strictEqual(logged.length, 1);
			strictEqual(logged[0].reason, 'primary');
		});

		test('returns empty text when snapshot has no content', async () => {
			const xtermImpl = new TestXtermTerminal();
			xtermImpl.nextResult = undefined;
			const xterm = xtermImpl as unknown as XtermTerminal;

			const executedMarker = new TestMarker(1, 10) as unknown as IXtermMarker;
			const endMarker = new TestMarker(2, 12) as unknown as IXtermMarker;
			const command = createCommand(executedMarker, endMarker);

			const result = await getCommandOutputSnapshot(xterm, command);

			deepStrictEqual(result, { text: '', lineCount: 0 });
		});
	});

	suite('DetachedTerminalCommandMirror', () => {
		test('renderCommand writes initial output to detached terminal', async () => {
			const raw = new TestRawTerminal(0);
			const xtermImpl = new TestXtermTerminal(raw);
			xtermImpl.nextResult = 'line1\r\nline2';
			const xterm = xtermImpl as unknown as XtermTerminal;

			const executedMarker = new TestMarker(1, 0) as unknown as IXtermMarker;
			const endMarker = new TestMarker(2, 1) as unknown as IXtermMarker;
			const command = createCommand(executedMarker, endMarker);

			const mirror = store.add(new DetachedTerminalCommandMirror(
				xterm,
				new ImmortalReference<TerminalLocation | undefined>(undefined),
				command,
				{} as ITerminalService,
				{} as IInstantiationService
			));

			const writes: string[] = [];
			const detached = {
				xterm: {
					write: (data: string) => {
						writes.push(data);
					}
				},
				attachToElement: () => { /* no-op */ },
				dispose: () => { /* no-op */ },
				capabilities: {
					has: () => false
				},
				selection: undefined,
				hasSelection: () => false,
				clearSelection: () => { /* no-op */ },
				focus: () => { /* no-op */ },
				forceScrollbarVisibility: () => { /* no-op */ },
				resetScrollbarVisibility: () => { /* no-op */ },
				getContribution: () => null
			} as unknown as IDetachedTerminalInstance;

			// Bypass actual detached terminal creation for this focused unit test.
			(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => detached;

			const result = await mirror.renderCommand();

			deepStrictEqual(writes, ['line1\r\nline2']);
			strictEqual(result?.lineCount, 2);
		});

		test('renderCommand supports partial commands via commandExecutedMarker', async () => {
			const raw = new TestRawTerminal(0);
			const xtermImpl = new TestXtermTerminal(raw);
			xtermImpl.nextResult = 'only-line';
			const xterm = xtermImpl as unknown as XtermTerminal;

			const executedMarker = new TestMarker(1, 0) as unknown as IXtermMarker;
			const endMarker = new TestMarker(2, 1) as unknown as IXtermMarker;

			const command = {
				endMarker,
				executedMarker: undefined,
				commandExecutedMarker: executedMarker
			} as unknown as ITerminalCommand & ICurrentPartialCommand;

			const mirror = store.add(new DetachedTerminalCommandMirror(
				xterm,
				new ImmortalReference<TerminalLocation | undefined>(undefined),
				command,
				{} as ITerminalService,
				{} as IInstantiationService
			));

			const writes: string[] = [];
			const detached = {
				xterm: {
					write: (data: string) => {
						writes.push(data);
					}
				},
				attachToElement: () => { /* no-op */ },
				dispose: () => { /* no-op */ },
				capabilities: {
					has: () => false
				},
				selection: undefined,
				hasSelection: () => false,
				clearSelection: () => { /* no-op */ },
				focus: () => { /* no-op */ },
				forceScrollbarVisibility: () => { /* no-op */ },
				resetScrollbarVisibility: () => { /* no-op */ },
				getContribution: () => null
			} as unknown as IDetachedTerminalInstance;

			(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => detached;

			const result = await mirror.renderCommand();

			deepStrictEqual(writes, ['only-line']);
			strictEqual(result?.lineCount, 1);
		});
	});
});

