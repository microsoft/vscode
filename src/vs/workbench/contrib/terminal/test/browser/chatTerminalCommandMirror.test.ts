/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal, IMarker as IXtermMarker } from '@xterm/xterm';
import { deepStrictEqual, strictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../amdX.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ICommandDetectionCapability, TerminalCapability, type ITerminalCommand } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import type { ICurrentPartialCommand } from '../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import type { IDetachedTerminalInstance, ITerminalService } from '../../browser/terminal.js';
import { DetachedTerminalCommandMirror, getCommandOutputSnapshot } from '../../browser/chatTerminalCommandMirror.js';
import { XtermTerminal } from '../../browser/xterm/xtermTerminal.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestXtermAddonImporter } from './xterm/xtermTestUtils.js';

const defaultTerminalConfig = {
	fontFamily: 'monospace',
	fontWeight: 'normal',
	fontWeightBold: 'normal',
	gpuAcceleration: 'off',
	scrollback: 10,
	fastScrollSensitivity: 2,
	mouseWheelScrollSensitivity: 1,
	unicodeVersion: '6'
};

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

class MockCommandDetectionCapability extends Disposable {
	public readonly commands: ITerminalCommand[] = [];

	private readonly _onCommandStarted = this._register(new Emitter<ITerminalCommand>());
	readonly onCommandStarted = this._onCommandStarted.event;

	private readonly _onCommandFinished = this._register(new Emitter<ITerminalCommand>());
	readonly onCommandFinished = this._onCommandFinished.event;

	private readonly _onCommandExecuted = this._register(new Emitter<ITerminalCommand>());
	readonly onCommandExecuted = this._onCommandExecuted.event;

	private readonly _onCommandInvalidated = this._register(new Emitter<ITerminalCommand[]>());
	readonly onCommandInvalidated = this._onCommandInvalidated.event;

	private readonly _onCurrentCommandInvalidated = this._register(new Emitter<unknown>());
	readonly onCurrentCommandInvalidated = this._onCurrentCommandInvalidated.event;

	private readonly _onSetRichCommandDetection = this._register(new Emitter<boolean>());
	readonly onSetRichCommandDetection = this._onSetRichCommandDetection.event;

	addCommand(command: ITerminalCommand): void {
		this.commands.push(command);
		// For the purposes of these tests, immediately signal a full command lifecycle.
		this._onCommandStarted.fire(command);
		this._onCommandExecuted.fire(command);
		this._onCommandFinished.fire(command);
	}
}

function createDetachedTerminal(writes: string[]): IDetachedTerminalInstance {
	let cursorY = 0;
	let baseY = 0;
	return {
		xterm: {
			write: (data: string, callback?: () => void) => {
				writes.push(data);
				// Simulate cursor position updates based on line feeds
				const lines = data.split('\r\n');
				cursorY += lines.length - 1;
				// If cursor goes beyond visible area, update baseY (scrollback)
				if (cursorY >= 10) {
					baseY += cursorY - 9;
					cursorY = 9;
				}
				if (callback) {
					callback();
				}
			},
			buffer: {
				active: {
					get baseY() { return baseY; },
					get cursorY() { return cursorY; }
				}
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
			// lineCount is derived from marker lines: endMarker.line - executedMarker.line + 1
			strictEqual(result?.lineCount, 6);
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
			// lineCount is derived from marker lines: endMarker.line - startLine + 1
			strictEqual(result?.lineCount, 4);
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
				command,
				{} as ITerminalService,
				{} as IContextKeyService
			));

			const writes: string[] = [];
			const detached = createDetachedTerminal(writes);

			// Bypass actual detached terminal creation for this focused unit test.
			(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
				(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
				return detached;
			};

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
				command,
				{} as ITerminalService,
				{} as IContextKeyService
			));

			const writes: string[] = [];
			const detached = createDetachedTerminal(writes);

			(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
				(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
				return detached;
			};

			const result = await mirror.renderCommand();

			deepStrictEqual(writes, ['only-line']);
			strictEqual(result?.lineCount, 1);
		});

		suite('with XtermTerminal', () => {
			let instantiationService: TestInstantiationService;
			let configurationService: TestConfigurationService;
			let xterm: XtermTerminal;
			let XTermBaseCtor: typeof Terminal;
			let commandDetection: MockCommandDetectionCapability;

			function write(data: string): Promise<void> {
				return new Promise<void>((resolve) => {
					xterm.write(data, resolve);
				});
			}

			setup(async () => {
				configurationService = new TestConfigurationService({
					editor: {
						fastScrollSensitivity: 2,
						mouseWheelScrollSensitivity: 1
					} as Partial<IEditorOptions>,
					files: {},
					terminal: {
						integrated: defaultTerminalConfig
					},
				});

				instantiationService = workbenchInstantiationService({
					configurationService: () => configurationService
				}, store);

				XTermBaseCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;

				const capabilities = store.add(new TerminalCapabilityStore());
				commandDetection = store.add(new MockCommandDetectionCapability());
				capabilities.add(TerminalCapability.CommandDetection, commandDetection as unknown as ICommandDetectionCapability);

				xterm = store.add(instantiationService.createInstance(XtermTerminal, undefined, XTermBaseCtor, {
					cols: 80,
					rows: 10,
					xtermColorProvider: { getBackgroundColor: () => undefined },
					capabilities,
					disableShellIntegrationReporting: true,
					xtermAddonImporter: new TestXtermAddonImporter(),
				}, undefined));
			});

			test('renderCommand mirrors VT output from XtermTerminal', async () => {
				await write('prompt$ ');
				const executedMarker = xterm.raw.registerMarker(0)!;
				await write('echo one\r\necho two\r\n');
				const endMarker = xterm.raw.registerMarker(0)!;

				const command = createCommand(executedMarker, endMarker);
				commandDetection.addCommand(command);

				const mirror = store.add(new DetachedTerminalCommandMirror(
					xterm,
					command,
					{} as ITerminalService,
					{} as IContextKeyService
				));

				const writes: string[] = [];
				const detached = createDetachedTerminal(writes);

				(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
					(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
					return detached;
				};

				const expectedText = await xterm.getRangeAsVT(executedMarker, endMarker, true);
				const result = await mirror.renderCommand();

				strictEqual(writes.join(''), expectedText);
				// lineCount is derived from marker lines: endMarker.line - executedMarker.line + 1
				const expectedLineCount = endMarker.line - executedMarker.line + 1;
				strictEqual(result?.lineCount, expectedLineCount);
			});

			test('renderCommand appends only new VT on repeated calls', async () => {
				await write('prompt$ ');
				const executedMarker = xterm.raw.registerMarker(0)!;
				await write('line1\r\n');
				const firstEndMarker = xterm.raw.registerMarker(0)!;

				const command = createCommand(executedMarker, firstEndMarker);
				commandDetection.addCommand(command);

				const mirror = store.add(new DetachedTerminalCommandMirror(
					xterm,
					command,
					{} as ITerminalService,
					{} as IContextKeyService
				));

				const writes: string[] = [];
				const detached = createDetachedTerminal(writes);

				(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
					(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
					return detached;
				};

				const vt1 = await xterm.getRangeAsVT(executedMarker, firstEndMarker, true) ?? '';
				await mirror.renderCommand();

				await write('line2\r\n');
				const secondEndMarker = xterm.raw.registerMarker(0)!;
				command.endMarker = secondEndMarker;

				const vt2 = await xterm.getRangeAsVT(executedMarker, secondEndMarker, true) ?? '';
				await mirror.renderCommand();

				strictEqual(writes.length, 2);
				strictEqual(writes[0], vt1);
				strictEqual(writes[1], vt2.slice(vt1.length));
			});

			test('renderCommand mirrors VT output for partial commands via commandExecutedMarker', async () => {
				await write('prompt$ ');
				const commandExecutedMarker = xterm.raw.registerMarker(0)!;
				await write('partial output\r\n');
				const endMarker = xterm.raw.registerMarker(0)!;

				const command = {
					endMarker,
					executedMarker: undefined,
					commandExecutedMarker
				} as unknown as ITerminalCommand & ICurrentPartialCommand;
				commandDetection.addCommand(command);

				const mirror = store.add(new DetachedTerminalCommandMirror(
					xterm,
					command,
					{} as ITerminalService,
					{} as IContextKeyService
				));

				const writes: string[] = [];
				const detached = createDetachedTerminal(writes);

				(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
					(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
					return detached;
				};

				const expectedText = await xterm.getRangeAsVT(commandExecutedMarker, endMarker, true);
				const result = await mirror.renderCommand();

				strictEqual(writes.join(''), expectedText);
				// lineCount is derived from source buffer position since no executedMarker on command
				const sourceBuffer = xterm.raw.buffer.active;
				const expectedLineCount = sourceBuffer.baseY + sourceBuffer.cursorY - commandExecutedMarker.line + 1;
				strictEqual(result?.lineCount, expectedLineCount);
			});

			test('renderCommand mirrors VT output for in progress command (with no endMarker)', async () => {
				await write('prompt$ ');
				const executedMarker = xterm.raw.registerMarker(0)!;
				await write('partial output\r\n');

				const command = {
					executedMarker,
				} as unknown as ITerminalCommand & ICurrentPartialCommand;
				commandDetection.addCommand(command);

				const mirror = store.add(new DetachedTerminalCommandMirror(
					xterm,
					command,
					{} as ITerminalService,
					{} as IContextKeyService
				));

				const writes: string[] = [];
				const detached = createDetachedTerminal(writes);

				(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
					(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
					return detached;
				};

				const expectedText = await xterm.getRangeAsVT(executedMarker, undefined, true);
				const result = await mirror.renderCommand();

				strictEqual(writes.join(''), expectedText);
				// lineCount is derived from source buffer position since no endMarker
				const sourceBuffer = xterm.raw.buffer.active;
				const expectedLineCount = sourceBuffer.baseY + sourceBuffer.cursorY - executedMarker.line + 1;
				strictEqual(result?.lineCount, expectedLineCount);
			});

			suite('streaming via onDidUpdate', () => {
				test('onDidUpdate fires when new terminal data arrives after initial render', async () => {
					await write('prompt$ ');
					const executedMarker = xterm.raw.registerMarker(0)!;
					await write('line1\r\n');

					const command = {
						executedMarker,
					} as unknown as ITerminalCommand & ICurrentPartialCommand;

					const mirror = store.add(new DetachedTerminalCommandMirror(
						xterm,
						command,
						{} as ITerminalService,
						{} as IContextKeyService
					));

					const writes: string[] = [];
					const detached = createDetachedTerminal(writes);

					(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
						(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
						return detached;
					};

					// Initial render starts streaming
					await mirror.renderCommand();

					// Set up listener for onDidUpdate
					const updates: number[] = [];
					store.add(mirror.onDidUpdate(lineCount => updates.push(lineCount)));

					// Write more data to the source terminal
					await write('line2\r\n');

					// Wait for the streaming flush to occur (microtask + async flush)
					await new Promise(resolve => setTimeout(resolve, 50));

					// onDidUpdate should have fired with the new line count
					strictEqual(updates.length >= 1, true, 'onDidUpdate should have fired at least once');
				});

				test('streaming stops when endMarker is set', async () => {
					await write('prompt$ ');
					const executedMarker = xterm.raw.registerMarker(0)!;
					await write('line1\r\n');

					const command = {
						executedMarker,
					} as unknown as ITerminalCommand & ICurrentPartialCommand;

					const mirror = store.add(new DetachedTerminalCommandMirror(
						xterm,
						command,
						{} as ITerminalService,
						{} as IContextKeyService
					));

					const writes: string[] = [];
					const detached = createDetachedTerminal(writes);

					(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
						(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
						return detached;
					};

					// Initial render starts streaming
					await mirror.renderCommand();
					strictEqual((mirror as unknown as Record<string, unknown>)['_isStreaming'], true, 'should be streaming');

					// Set endMarker and trigger a flush
					command.endMarker = xterm.raw.registerMarker(0)!;
					await write('final\r\n');

					// Wait for the streaming flush to complete
					await new Promise(resolve => setTimeout(resolve, 50));

					// Streaming should have stopped
					strictEqual((mirror as unknown as Record<string, unknown>)['_isStreaming'], false, 'should stop streaming after endMarker');
				});

				test('streaming updates mirror with incremental data', async () => {
					await write('prompt$ ');
					const executedMarker = xterm.raw.registerMarker(0)!;
					await write('initial\r\n');

					const command = {
						executedMarker,
					} as unknown as ITerminalCommand & ICurrentPartialCommand;

					const mirror = store.add(new DetachedTerminalCommandMirror(
						xterm,
						command,
						{} as ITerminalService,
						{} as IContextKeyService
					));

					const writes: string[] = [];
					const detached = createDetachedTerminal(writes);

					(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
						(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
						return detached;
					};

					// Initial render
					await mirror.renderCommand();
					const initialWriteCount = writes.length;
					const initialVT = (mirror as unknown as Record<string, unknown>)['_lastVT'] as string;

					// Write more data
					await write('streamed1\r\n');
					await write('streamed2\r\n');

					// Wait for streaming flush
					await new Promise(resolve => setTimeout(resolve, 50));

					// Should have written additional data to the detached terminal
					strictEqual(writes.length > initialWriteCount, true, 'should have written more data');

					// The lastVT should have been updated
					const updatedVT = (mirror as unknown as Record<string, unknown>)['_lastVT'] as string;
					strictEqual(updatedVT.length > initialVT.length, true, 'VT snapshot should have grown');
				});

				test('cursor tracking updates dirty range correctly', async () => {
					await write('prompt$ ');
					const executedMarker = xterm.raw.registerMarker(0)!;
					await write('line1\r\n');

					const command = {
						executedMarker,
					} as unknown as ITerminalCommand & ICurrentPartialCommand;

					const mirror = store.add(new DetachedTerminalCommandMirror(
						xterm,
						command,
						{} as ITerminalService,
						{} as IContextKeyService
					));

					const writes: string[] = [];
					const detached = createDetachedTerminal(writes);

					(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
						(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
						return detached;
					};

					// Initial render sets up cursor tracking
					await mirror.renderCommand();

					const lastUpToDateCursorY = (mirror as unknown as Record<string, unknown>)['_lastUpToDateCursorY'] as number;
					strictEqual(typeof lastUpToDateCursorY, 'number', '_lastUpToDateCursorY should be set after render');

					// Write more data to advance cursor
					await write('more data\r\n');

					// Wait for flush
					await new Promise(resolve => setTimeout(resolve, 50));

					// Cursor tracking should have updated
					const newLastUpToDateCursorY = (mirror as unknown as Record<string, unknown>)['_lastUpToDateCursorY'] as number;
					strictEqual(newLastUpToDateCursorY >= lastUpToDateCursorY, true, 'cursor Y should advance or stay same');
				});

				test('multiple rapid writes are batched in streaming flush', async () => {
					await write('prompt$ ');
					const executedMarker = xterm.raw.registerMarker(0)!;
					await write('start\r\n');

					const command = {
						executedMarker,
					} as unknown as ITerminalCommand & ICurrentPartialCommand;

					const mirror = store.add(new DetachedTerminalCommandMirror(
						xterm,
						command,
						{} as ITerminalService,
						{} as IContextKeyService
					));

					const writes: string[] = [];
					const detached = createDetachedTerminal(writes);

					(mirror as unknown as Record<string, unknown>)['_getOrCreateTerminal'] = async () => {
						(mirror as unknown as Record<string, unknown>)['_detachedTerminal'] = detached;
						return detached;
					};

					// Initial render
					await mirror.renderCommand();
					const updateCounts: number[] = [];
					store.add(mirror.onDidUpdate(count => updateCounts.push(count)));

					// Rapid writes without waiting
					xterm.write('a\r\n');
					xterm.write('b\r\n');
					xterm.write('c\r\n');

					// Wait for batched flush
					await new Promise(resolve => setTimeout(resolve, 100));

					// The dirty scheduling should batch these, so we expect fewer updates than writes
					// At minimum we should have at least one update
					strictEqual(updateCounts.length >= 1, true, 'should have received at least one batched update');
				});
			});
		});
	});
});
