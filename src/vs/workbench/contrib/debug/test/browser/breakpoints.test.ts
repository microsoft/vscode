/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { dispose } from '../../../../../base/common/lifecycle.js';
import { URI as uri } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { OverviewRulerLane } from '../../../../../editor/common/model.js';
import { LanguageService } from '../../../../../editor/common/services/languageService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { createBreakpointDecorations } from '../../browser/breakpointEditorContribution.js';
import { getBreakpointMessageAndIcon, getExpandedBodySize } from '../../browser/breakpointsView.js';
import { DataBreakpointSetType, IBreakpointData, IBreakpointUpdateData, IDebugService, State } from '../../common/debug.js';
import { Breakpoint, DebugModel } from '../../common/debugModel.js';
import { createTestSession } from './callStack.test.js';
import { createMockDebugModel, mockUriIdentityService } from './mockDebugModel.js';
import { MockDebugService, MockDebugStorage } from '../common/mockDebug.js';
import { MockLabelService } from '../../../../services/label/test/common/mockLabelService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';

function addBreakpointsAndCheckEvents(model: DebugModel, uri: uri, data: IBreakpointData[]) {
	let eventCount = 0;
	const toDispose = model.onDidChangeBreakpoints(e => {
		assert.strictEqual(e?.sessionOnly, false);
		assert.strictEqual(e?.changed, undefined);
		assert.strictEqual(e?.removed, undefined);
		const added = e?.added;
		assert.notStrictEqual(added, undefined);
		assert.strictEqual(added!.length, data.length);
		eventCount++;
		dispose(toDispose);
		for (let i = 0; i < data.length; i++) {
			assert.strictEqual(e.added![i] instanceof Breakpoint, true);
			assert.strictEqual((e.added![i] as Breakpoint).lineNumber, data[i].lineNumber);
		}
	});
	const bps = model.addBreakpoints(uri, data);
	assert.strictEqual(eventCount, 1);
	return bps;
}

suite('Debug - Breakpoints', () => {
	let model: DebugModel;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		model = createMockDebugModel(disposables);
	});

	// Breakpoints

	test('simple', () => {
		const modelUri = uri.file('/myfolder/myfile.js');

		addBreakpointsAndCheckEvents(model, modelUri, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		assert.strictEqual(model.areBreakpointsActivated(), true);
		assert.strictEqual(model.getBreakpoints().length, 2);

		let eventCount = 0;
		const toDispose = model.onDidChangeBreakpoints(e => {
			eventCount++;
			assert.strictEqual(e?.added, undefined);
			assert.strictEqual(e?.sessionOnly, false);
			assert.strictEqual(e?.removed?.length, 2);
			assert.strictEqual(e?.changed, undefined);

			dispose(toDispose);
		});

		model.removeBreakpoints(model.getBreakpoints());
		assert.strictEqual(eventCount, 1);
		assert.strictEqual(model.getBreakpoints().length, 0);
	});

	test('toggling', () => {
		const modelUri = uri.file('/myfolder/myfile.js');

		addBreakpointsAndCheckEvents(model, modelUri, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		addBreakpointsAndCheckEvents(model, modelUri, [{ lineNumber: 12, enabled: true, condition: 'fake condition' }]);
		assert.strictEqual(model.getBreakpoints().length, 3);
		const bp = model.getBreakpoints().pop();
		if (bp) {
			model.removeBreakpoints([bp]);
		}
		assert.strictEqual(model.getBreakpoints().length, 2);

		model.setBreakpointsActivated(false);
		assert.strictEqual(model.areBreakpointsActivated(), false);
		model.setBreakpointsActivated(true);
		assert.strictEqual(model.areBreakpointsActivated(), true);
	});

	test('two files', () => {
		const modelUri1 = uri.file('/myfolder/my file first.js');
		const modelUri2 = uri.file('/secondfolder/second/second file.js');
		addBreakpointsAndCheckEvents(model, modelUri1, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		assert.strictEqual(getExpandedBodySize(model, undefined, 9), 44);

		addBreakpointsAndCheckEvents(model, modelUri2, [{ lineNumber: 1, enabled: true }, { lineNumber: 2, enabled: true }, { lineNumber: 3, enabled: false }]);
		assert.strictEqual(getExpandedBodySize(model, undefined, 9), 110);

		assert.strictEqual(model.getBreakpoints().length, 5);
		assert.strictEqual(model.getBreakpoints({ uri: modelUri1 }).length, 2);
		assert.strictEqual(model.getBreakpoints({ uri: modelUri2 }).length, 3);
		assert.strictEqual(model.getBreakpoints({ lineNumber: 5 }).length, 1);
		assert.strictEqual(model.getBreakpoints({ column: 5 }).length, 0);

		const bp = model.getBreakpoints()[0];
		const update = new Map<string, IBreakpointUpdateData>();
		update.set(bp.getId(), { lineNumber: 100 });
		let eventFired = false;
		const toDispose = model.onDidChangeBreakpoints(e => {
			eventFired = true;
			assert.strictEqual(e?.added, undefined);
			assert.strictEqual(e?.removed, undefined);
			assert.strictEqual(e?.changed?.length, 1);
			dispose(toDispose);
		});
		model.updateBreakpoints(update);
		assert.strictEqual(eventFired, true);
		assert.strictEqual(bp.lineNumber, 100);

		assert.strictEqual(model.getBreakpoints({ enabledOnly: true }).length, 3);
		model.enableOrDisableAllBreakpoints(false);
		model.getBreakpoints().forEach(bp => {
			assert.strictEqual(bp.enabled, false);
		});
		assert.strictEqual(model.getBreakpoints({ enabledOnly: true }).length, 0);

		model.setEnablement(bp, true);
		assert.strictEqual(bp.enabled, true);

		model.removeBreakpoints(model.getBreakpoints({ uri: modelUri1 }));
		assert.strictEqual(getExpandedBodySize(model, undefined, 9), 66);

		assert.strictEqual(model.getBreakpoints().length, 3);
	});

	test('conditions', () => {
		const modelUri1 = uri.file('/myfolder/my file first.js');
		addBreakpointsAndCheckEvents(model, modelUri1, [{ lineNumber: 5, condition: 'i < 5', hitCondition: '17' }, { lineNumber: 10, condition: 'j < 3' }]);
		const breakpoints = model.getBreakpoints();

		assert.strictEqual(breakpoints[0].condition, 'i < 5');
		assert.strictEqual(breakpoints[0].hitCondition, '17');
		assert.strictEqual(breakpoints[1].condition, 'j < 3');
		assert.strictEqual(!!breakpoints[1].hitCondition, false);

		assert.strictEqual(model.getBreakpoints().length, 2);
		model.removeBreakpoints(model.getBreakpoints());
		assert.strictEqual(model.getBreakpoints().length, 0);
	});

	test('function breakpoints', () => {
		model.addFunctionBreakpoint({ name: 'foo' }, '1');
		model.addFunctionBreakpoint({ name: 'bar' }, '2');
		model.updateFunctionBreakpoint('1', { name: 'fooUpdated' });
		model.updateFunctionBreakpoint('2', { name: 'barUpdated' });

		const functionBps = model.getFunctionBreakpoints();
		assert.strictEqual(functionBps[0].name, 'fooUpdated');
		assert.strictEqual(functionBps[1].name, 'barUpdated');

		model.removeFunctionBreakpoints();
		assert.strictEqual(model.getFunctionBreakpoints().length, 0);
	});

	test('multiple sessions', () => {
		const modelUri = uri.file('/myfolder/myfile.js');
		addBreakpointsAndCheckEvents(model, modelUri, [{ lineNumber: 5, enabled: true, condition: 'x > 5' }, { lineNumber: 10, enabled: false }]);
		const breakpoints = model.getBreakpoints();
		const session = disposables.add(createTestSession(model));
		const data = new Map<string, DebugProtocol.Breakpoint>();

		assert.strictEqual(breakpoints[0].lineNumber, 5);
		assert.strictEqual(breakpoints[1].lineNumber, 10);

		data.set(breakpoints[0].getId(), { verified: false, line: 10 });
		data.set(breakpoints[1].getId(), { verified: true, line: 50 });
		model.setBreakpointSessionData(session.getId(), {}, data);
		assert.strictEqual(breakpoints[0].lineNumber, 5);
		assert.strictEqual(breakpoints[1].lineNumber, 50);

		const session2 = disposables.add(createTestSession(model));
		const data2 = new Map<string, DebugProtocol.Breakpoint>();
		data2.set(breakpoints[0].getId(), { verified: true, line: 100 });
		data2.set(breakpoints[1].getId(), { verified: true, line: 500 });
		model.setBreakpointSessionData(session2.getId(), {}, data2);

		// Breakpoint is verified only once, show that line
		assert.strictEqual(breakpoints[0].lineNumber, 100);
		// Breakpoint is verified two times, show the original line
		assert.strictEqual(breakpoints[1].lineNumber, 10);

		model.setBreakpointSessionData(session.getId(), {}, undefined);
		// No more double session verification
		assert.strictEqual(breakpoints[0].lineNumber, 100);
		assert.strictEqual(breakpoints[1].lineNumber, 500);

		assert.strictEqual(breakpoints[0].supported, false);
		const data3 = new Map<string, DebugProtocol.Breakpoint>();
		data3.set(breakpoints[0].getId(), { verified: true, line: 500 });
		model.setBreakpointSessionData(session2.getId(), { supportsConditionalBreakpoints: true }, data2);
		assert.strictEqual(breakpoints[0].supported, true);
	});

	test('exception breakpoints', () => {
		let eventCount = 0;
		disposables.add(model.onDidChangeBreakpoints(() => eventCount++));
		model.setExceptionBreakpointsForSession("session-id-1", [{ filter: 'uncaught', label: 'UNCAUGHT', default: true }]);
		assert.strictEqual(eventCount, 1);
		let exceptionBreakpoints = model.getExceptionBreakpointsForSession("session-id-1");
		assert.strictEqual(exceptionBreakpoints.length, 1);
		assert.strictEqual(exceptionBreakpoints[0].filter, 'uncaught');
		assert.strictEqual(exceptionBreakpoints[0].enabled, true);

		model.setExceptionBreakpointsForSession("session-id-2", [{ filter: 'uncaught', label: 'UNCAUGHT' }, { filter: 'caught', label: 'CAUGHT' }]);
		assert.strictEqual(eventCount, 2);
		exceptionBreakpoints = model.getExceptionBreakpointsForSession("session-id-2");
		assert.strictEqual(exceptionBreakpoints.length, 2);
		assert.strictEqual(exceptionBreakpoints[0].filter, 'uncaught');
		assert.strictEqual(exceptionBreakpoints[0].enabled, true);
		assert.strictEqual(exceptionBreakpoints[1].filter, 'caught');
		assert.strictEqual(exceptionBreakpoints[1].label, 'CAUGHT');
		assert.strictEqual(exceptionBreakpoints[1].enabled, false);

		model.setExceptionBreakpointsForSession("session-id-3", [{ filter: 'all', label: 'ALL' }]);
		assert.strictEqual(eventCount, 3);
		assert.strictEqual(model.getExceptionBreakpointsForSession("session-id-3").length, 1);
		exceptionBreakpoints = model.getExceptionBreakpoints();
		assert.strictEqual(exceptionBreakpoints[0].filter, 'uncaught');
		assert.strictEqual(exceptionBreakpoints[0].enabled, true);
		assert.strictEqual(exceptionBreakpoints[1].filter, 'caught');
		assert.strictEqual(exceptionBreakpoints[1].label, 'CAUGHT');
		assert.strictEqual(exceptionBreakpoints[1].enabled, false);
		assert.strictEqual(exceptionBreakpoints[2].filter, 'all');
		assert.strictEqual(exceptionBreakpoints[2].label, 'ALL');
	});

	test('exception breakpoints multiple sessions', () => {
		let eventCount = 0;
		disposables.add(model.onDidChangeBreakpoints(() => eventCount++));

		model.setExceptionBreakpointsForSession("session-id-4", [{ filter: 'uncaught', label: 'UNCAUGHT', default: true }, { filter: 'caught', label: 'CAUGHT' }]);
		model.setExceptionBreakpointFallbackSession("session-id-4");
		assert.strictEqual(eventCount, 1);
		let exceptionBreakpointsForSession = model.getExceptionBreakpointsForSession("session-id-4");
		assert.strictEqual(exceptionBreakpointsForSession.length, 2);
		assert.strictEqual(exceptionBreakpointsForSession[0].filter, 'uncaught');
		assert.strictEqual(exceptionBreakpointsForSession[1].filter, 'caught');

		model.setExceptionBreakpointsForSession("session-id-5", [{ filter: 'all', label: 'ALL' }, { filter: 'caught', label: 'CAUGHT' }]);
		assert.strictEqual(eventCount, 2);
		exceptionBreakpointsForSession = model.getExceptionBreakpointsForSession("session-id-5");
		let exceptionBreakpointsForUndefined = model.getExceptionBreakpointsForSession(undefined);
		assert.strictEqual(exceptionBreakpointsForSession.length, 2);
		assert.strictEqual(exceptionBreakpointsForSession[0].filter, 'caught');
		assert.strictEqual(exceptionBreakpointsForSession[1].filter, 'all');
		assert.strictEqual(exceptionBreakpointsForUndefined.length, 2);
		assert.strictEqual(exceptionBreakpointsForUndefined[0].filter, 'uncaught');
		assert.strictEqual(exceptionBreakpointsForUndefined[1].filter, 'caught');

		model.removeExceptionBreakpointsForSession("session-id-4");
		assert.strictEqual(eventCount, 2);
		exceptionBreakpointsForUndefined = model.getExceptionBreakpointsForSession(undefined);
		assert.strictEqual(exceptionBreakpointsForUndefined.length, 2);
		assert.strictEqual(exceptionBreakpointsForUndefined[0].filter, 'uncaught');
		assert.strictEqual(exceptionBreakpointsForUndefined[1].filter, 'caught');

		model.setExceptionBreakpointFallbackSession("session-id-5");
		assert.strictEqual(eventCount, 2);
		exceptionBreakpointsForUndefined = model.getExceptionBreakpointsForSession(undefined);
		assert.strictEqual(exceptionBreakpointsForUndefined.length, 2);
		assert.strictEqual(exceptionBreakpointsForUndefined[0].filter, 'caught');
		assert.strictEqual(exceptionBreakpointsForUndefined[1].filter, 'all');

		const exceptionBreakpoints = model.getExceptionBreakpoints();
		assert.strictEqual(exceptionBreakpoints.length, 3);
	});

	test('instruction breakpoints', () => {
		let eventCount = 0;
		disposables.add(model.onDidChangeBreakpoints(() => eventCount++));
		//address: string, offset: number, condition?: string, hitCondition?: string
		model.addInstructionBreakpoint({ instructionReference: '0xCCCCFFFF', offset: 0, address: 0n, canPersist: false });

		assert.strictEqual(eventCount, 1);
		let instructionBreakpoints = model.getInstructionBreakpoints();
		assert.strictEqual(instructionBreakpoints.length, 1);
		assert.strictEqual(instructionBreakpoints[0].instructionReference, '0xCCCCFFFF');
		assert.strictEqual(instructionBreakpoints[0].offset, 0);

		model.addInstructionBreakpoint({ instructionReference: '0xCCCCEEEE', offset: 1, address: 0n, canPersist: false });
		assert.strictEqual(eventCount, 2);
		instructionBreakpoints = model.getInstructionBreakpoints();
		assert.strictEqual(instructionBreakpoints.length, 2);
		assert.strictEqual(instructionBreakpoints[0].instructionReference, '0xCCCCFFFF');
		assert.strictEqual(instructionBreakpoints[0].offset, 0);
		assert.strictEqual(instructionBreakpoints[1].instructionReference, '0xCCCCEEEE');
		assert.strictEqual(instructionBreakpoints[1].offset, 1);
	});

	test('data breakpoints', () => {
		let eventCount = 0;
		disposables.add(model.onDidChangeBreakpoints(() => eventCount++));

		model.addDataBreakpoint({ description: 'label', src: { type: DataBreakpointSetType.Variable, dataId: 'id' }, canPersist: true, accessTypes: ['read'], accessType: 'read' }, '1');
		model.addDataBreakpoint({ description: 'second', src: { type: DataBreakpointSetType.Variable, dataId: 'secondId' }, canPersist: false, accessTypes: ['readWrite'], accessType: 'readWrite' }, '2');
		model.updateDataBreakpoint('1', { condition: 'aCondition' });
		model.updateDataBreakpoint('2', { hitCondition: '10' });
		const dataBreakpoints = model.getDataBreakpoints();
		assert.strictEqual(dataBreakpoints[0].canPersist, true);
		assert.deepStrictEqual(dataBreakpoints[0].src, { type: DataBreakpointSetType.Variable, dataId: 'id' });
		assert.strictEqual(dataBreakpoints[0].accessType, 'read');
		assert.strictEqual(dataBreakpoints[0].condition, 'aCondition');
		assert.strictEqual(dataBreakpoints[1].canPersist, false);
		assert.strictEqual(dataBreakpoints[1].description, 'second');
		assert.strictEqual(dataBreakpoints[1].accessType, 'readWrite');
		assert.strictEqual(dataBreakpoints[1].hitCondition, '10');

		assert.strictEqual(eventCount, 4);

		model.removeDataBreakpoints(dataBreakpoints[0].getId());
		assert.strictEqual(eventCount, 5);
		assert.strictEqual(model.getDataBreakpoints().length, 1);

		model.removeDataBreakpoints();
		assert.strictEqual(model.getDataBreakpoints().length, 0);
		assert.strictEqual(eventCount, 6);
	});

	test('message and class name', () => {
		const modelUri = uri.file('/myfolder/my file first.js');
		addBreakpointsAndCheckEvents(model, modelUri, [
			{ lineNumber: 5, enabled: true, condition: 'x > 5' },
			{ lineNumber: 10, enabled: false },
			{ lineNumber: 12, enabled: true, logMessage: 'hello' },
			{ lineNumber: 15, enabled: true, hitCondition: '12' },
			{ lineNumber: 500, enabled: true },
		]);
		const breakpoints = model.getBreakpoints();
		const ls = new MockLabelService();

		let result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[0], ls, model);
		assert.strictEqual(result.message, 'Condition: x > 5');
		assert.strictEqual(result.icon.id, 'debug-breakpoint-conditional');

		result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[1], ls, model);
		assert.strictEqual(result.message, 'Disabled Breakpoint');
		assert.strictEqual(result.icon.id, 'debug-breakpoint-disabled');

		result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[2], ls, model);
		assert.strictEqual(result.message, 'Log Message: hello');
		assert.strictEqual(result.icon.id, 'debug-breakpoint-log');

		result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[3], ls, model);
		assert.strictEqual(result.message, 'Hit Count: 12');
		assert.strictEqual(result.icon.id, 'debug-breakpoint-conditional');

		result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[4], ls, model);
		assert.strictEqual(result.message, ls.getUriLabel(breakpoints[4].uri));
		assert.strictEqual(result.icon.id, 'debug-breakpoint');

		result = getBreakpointMessageAndIcon(State.Stopped, false, breakpoints[2], ls, model);
		assert.strictEqual(result.message, 'Disabled Logpoint');
		assert.strictEqual(result.icon.id, 'debug-breakpoint-log-disabled');

		model.addDataBreakpoint({ description: 'label', canPersist: true, accessTypes: ['read'], accessType: 'read', src: { type: DataBreakpointSetType.Variable, dataId: 'id' } });
		const dataBreakpoints = model.getDataBreakpoints();
		result = getBreakpointMessageAndIcon(State.Stopped, true, dataBreakpoints[0], ls, model);
		assert.strictEqual(result.message, 'Data Breakpoint');
		assert.strictEqual(result.icon.id, 'debug-breakpoint-data');

		const functionBreakpoint = model.addFunctionBreakpoint({ name: 'foo' }, '1');
		result = getBreakpointMessageAndIcon(State.Stopped, true, functionBreakpoint, ls, model);
		assert.strictEqual(result.message, 'Function Breakpoint');
		assert.strictEqual(result.icon.id, 'debug-breakpoint-function');

		const data = new Map<string, DebugProtocol.Breakpoint>();
		data.set(breakpoints[0].getId(), { verified: false, line: 10 });
		data.set(breakpoints[1].getId(), { verified: true, line: 50 });
		data.set(breakpoints[2].getId(), { verified: true, line: 50, message: 'world' });
		data.set(functionBreakpoint.getId(), { verified: true });
		model.setBreakpointSessionData('mocksessionid', { supportsFunctionBreakpoints: false, supportsDataBreakpoints: true, supportsLogPoints: true }, data);

		result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[0], ls, model);
		assert.strictEqual(result.message, 'Unverified Breakpoint');
		assert.strictEqual(result.icon.id, 'debug-breakpoint-unverified');

		result = getBreakpointMessageAndIcon(State.Stopped, true, functionBreakpoint, ls, model);
		assert.strictEqual(result.message, 'Function breakpoints not supported by this debug type');
		assert.strictEqual(result.icon.id, 'debug-breakpoint-function-unverified');

		result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[2], ls, model);
		assert.strictEqual(result.message, 'Log Message: hello, world');
		assert.strictEqual(result.icon.id, 'debug-breakpoint-log');
	});

	test('decorations', () => {
		const modelUri = uri.file('/myfolder/my file first.js');
		const languageId = 'testMode';
		const textModel = createTextModel(
			['this is line one', 'this is line two', '    this is line three it has whitespace at start', 'this is line four', 'this is line five'].join('\n'),
			languageId
		);
		addBreakpointsAndCheckEvents(model, modelUri, [
			{ lineNumber: 1, enabled: true, condition: 'x > 5' },
			{ lineNumber: 2, column: 4, enabled: false },
			{ lineNumber: 3, enabled: true, logMessage: 'hello' },
			{ lineNumber: 500, enabled: true },
		]);
		const breakpoints = model.getBreakpoints();

		const instantiationService = new TestInstantiationService();
		const debugService = new MockDebugService();
		debugService.getModel = () => model;
		instantiationService.stub(IDebugService, debugService);
		instantiationService.stub(ILabelService, new MockLabelService());
		instantiationService.stub(ILanguageService, disposables.add(new LanguageService()));
		let decorations = instantiationService.invokeFunction(accessor => createBreakpointDecorations(accessor, textModel, breakpoints, State.Running, true, true));
		assert.strictEqual(decorations.length, 3); // last breakpoint filtered out since it has a large line number
		assert.deepStrictEqual(decorations[0].range, new Range(1, 1, 1, 2));
		assert.deepStrictEqual(decorations[1].range, new Range(2, 4, 2, 5));
		assert.deepStrictEqual(decorations[2].range, new Range(3, 5, 3, 6));
		assert.strictEqual(decorations[0].options.beforeContentClassName, undefined);
		assert.strictEqual(decorations[1].options.before?.inlineClassName, `debug-breakpoint-placeholder`);
		assert.strictEqual(decorations[0].options.overviewRuler?.position, OverviewRulerLane.Left);
		const expected = new MarkdownString(undefined, { isTrusted: true, supportThemeIcons: true }).appendCodeblock(languageId, 'Condition: x > 5');
		assert.deepStrictEqual(decorations[0].options.glyphMarginHoverMessage, expected);

		decorations = instantiationService.invokeFunction(accessor => createBreakpointDecorations(accessor, textModel, breakpoints, State.Running, true, false));
		assert.strictEqual(decorations[0].options.overviewRuler, null);

		textModel.dispose();
		instantiationService.dispose();
	});

	test('updates when storage changes', () => {
		const storage1 = disposables.add(new TestStorageService());
		const debugStorage1 = disposables.add(new MockDebugStorage(storage1));
		const model1 = disposables.add(new DebugModel(debugStorage1, <any>{ isDirty: (e: any) => false }, mockUriIdentityService, new NullLogService()));

		// 1. create breakpoints in the first model
		const modelUri = uri.file('/myfolder/my file first.js');
		const first = [
			{ lineNumber: 1, enabled: true, condition: 'x > 5' },
			{ lineNumber: 2, column: 4, enabled: false },
		];

		addBreakpointsAndCheckEvents(model1, modelUri, first);
		debugStorage1.storeBreakpoints(model1);
		const stored = storage1.get('debug.breakpoint', StorageScope.WORKSPACE);

		// 2. hydrate a new model and ensure external breakpoints get applied
		const storage2 = disposables.add(new TestStorageService());
		const model2 = disposables.add(new DebugModel(disposables.add(new MockDebugStorage(storage2)), <any>{ isDirty: (e: any) => false }, mockUriIdentityService, new NullLogService()));
		storage2.store('debug.breakpoint', stored, StorageScope.WORKSPACE, StorageTarget.USER, /* external= */ true);
		assert.deepStrictEqual(model2.getBreakpoints().map(b => b.getId()), model1.getBreakpoints().map(b => b.getId()));

		// 3. ensure non-external changes are ignored
		storage2.store('debug.breakpoint', '[]', StorageScope.WORKSPACE, StorageTarget.USER, /* external= */ false);
		assert.deepStrictEqual(model2.getBreakpoints().map(b => b.getId()), model1.getBreakpoints().map(b => b.getId()));
	});
});
