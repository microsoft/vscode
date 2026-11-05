/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import assert from 'assert';
import * as sinon from 'sinon';
import { importAMDNodeModule } from '../../../../../amdX.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ShellIntegrationAddon } from '../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IDetachedTerminalInstance, IDetachedXTermOptions, IDetachedXtermTerminal, ITerminalService } from '../../../terminal/browser/terminal.js';
import { writeP } from '../../../terminal/browser/terminalTestHelpers.js';
import { ITerminalFont } from '../../../terminal/common/terminal.js';
import { TestXtermLogger } from '../../../../../platform/terminal/test/common/terminalTestHelpers.js';
import { TerminalMessagePeek } from '../../browser/testResultsView/testResultsOutput.js';
import { MessageSubject, TaskSubject, TestOutputSubject } from '../../browser/testResultsView/testResultsSubject.js';
import { LiveTestResult } from '../../common/testResult.js';
import { TestRunProfileBitset } from '../../common/testTypes.js';

suite('Testing output terminal', () => {
	teardown(async () => {
		// Drain queued layout work before the fixture disposal hook runs.
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let result: LiveTestResult;
	let peek: TerminalMessagePeek;
	let xterm: IDetachedXtermTerminal;
	let raw: Terminal;
	let integration: ShellIntegrationAddon;
	let selected: sinon.SinonSpy;

	setup(async () => {
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		raw = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 10, logger: TestXtermLogger }));
		integration = store.add(new ShellIntegrationAddon('', true, undefined, undefined, new NullLogService()));
		raw.loadAddon(integration);
		selected = sinon.spy((start: string, end: string) => {
			const marks = integration.capabilities.get(TerminalCapability.BufferMarkDetection);
			assert.ok(marks?.getMark(start));
			assert.ok(marks?.getMark(end));
		});
		xterm = new class extends mock<IDetachedXtermTerminal>() {
			override write = raw.write.bind(raw);
			override registerOscHandler = raw.parser.registerOscHandler.bind(raw.parser);
			override clearBuffer = () => raw.clear();
			override clearSearchDecorations = () => { };
			override selectMarkedRange = selected;
			override getFont = () => upcastPartial<ITerminalFont>({});
		};
		const terminal = new class extends mock<IDetachedTerminalInstance>() {
			override xterm = xterm;
			override attachToElement = () => { };
			override dispose = () => { };
		};
		peek = store.add(new TerminalMessagePeek(mainWindow.document.createElement('div'), false,
			new class extends mock<ITerminalService>() {
				override async createDetachedTerminal(options: IDetachedXTermOptions) {
					store.add(options.capabilities!);
					return terminal;
				}
			},
			new class extends mock<IViewDescriptorService>() { },
			new class extends mock<IWorkspaceContextService>() { override getWorkspace = () => ({ id: 'workspace', folders: [] }); },
		));
		result = store.add(new LiveTestResult('result', false, { group: TestRunProfileBitset.Run, targets: [] }, 0, NullTelemetryService));
		result.addTask({ id: 'task', name: 'task', running: true, ctrlId: 'ctrl' });
		result.addTestChainToRun('ctrl', [{ extId: 'ctrl', label: 'test', tags: [], busy: false, uri: undefined, range: null, description: null, error: null, sortText: null }]);
		result.appendOutput(VSBuffer.fromString('hello \u2713\r\n'), 'task', undefined, 'ctrl');
	});

	test('whole-run output does not create hidden per-message markers', async () => {
		await peek.update(new TaskSubject(result, 0));
		assert.strictEqual(raw.buffer.active.getLine(0)?.translateToString(true), 'hello \u2713');
		assert.strictEqual(raw.markers.length, 0);
		result.appendOutput(VSBuffer.fromString('streamed\r\n'), 'task', undefined, 'ctrl');
		await writeP(raw, '');
		assert.strictEqual(raw.buffer.active.getLine(1)?.translateToString(true), 'streamed');
		assert.strictEqual(raw.markers.length, 0);
		await writeP(raw, '\x1b]633;SetMark;Id=visible\x07');
		assert.ok(integration.capabilities.get(TerminalCapability.BufferMarkDetection)?.getMark('visible'));
	});

	test('only keeps the selected message markers when switching output scopes', async () => {
		result.appendOutput(VSBuffer.fromString('second\r\n'), 'task', undefined, 'ctrl');
		await peek.update(new TaskSubject(result, 0));
		const test = result.getStateById('ctrl')!;
		await peek.update(new TestOutputSubject(result, 0, test));
		assert.strictEqual(raw.markers.length, 0);
		await peek.update(new MessageSubject(result, test, 0, 1));
		assert.strictEqual(raw.markers.length, 2);
		assert.ok(integration.capabilities.get(TerminalCapability.BufferMarkDetection)?.getMark('s1'));
		assert.ok(integration.capabilities.get(TerminalCapability.BufferMarkDetection)?.getMark('e1'));
		assert.deepStrictEqual(selected.firstCall.args, ['s1', 'e1', true]);
		assert.strictEqual(raw.buffer.active.getLine(0)?.translateToString(true), 'hello \u2713');
		await peek.update(new TaskSubject(result, 0));
		assert.strictEqual(raw.markers.length, 0);
	});

	test('removes the marker filter when the output view is disposed', async () => {
		await peek.update(new TaskSubject(result, 0));
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		peek.dispose();
		await writeP(raw, '\x1b]633;SetMark;Id=after-disposal;Hidden\x07');
		assert.ok(integration.capabilities.get(TerminalCapability.BufferMarkDetection)?.getMark('after-disposal'));
	});
});
