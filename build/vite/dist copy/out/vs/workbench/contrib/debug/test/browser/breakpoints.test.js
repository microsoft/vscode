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
import { createBreakpointDecorations } from '../../browser/breakpointEditorContribution.js';
import { getBreakpointMessageAndIcon, getExpandedBodySize } from '../../browser/breakpointsView.js';
import { IDebugService } from '../../common/debug.js';
import { Breakpoint, DebugModel } from '../../common/debugModel.js';
import { createTestSession } from './callStack.test.js';
import { createMockDebugModel, mockUriIdentityService } from './mockDebugModel.js';
import { MockDebugService, MockDebugStorage } from '../common/mockDebug.js';
import { MockLabelService } from '../../../../services/label/test/common/mockLabelService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
function addBreakpointsAndCheckEvents(model, uri, data) {
    let eventCount = 0;
    const toDispose = model.onDidChangeBreakpoints(e => {
        assert.strictEqual(e?.sessionOnly, false);
        assert.strictEqual(e?.changed, undefined);
        assert.strictEqual(e?.removed, undefined);
        const added = e?.added;
        assert.notStrictEqual(added, undefined);
        assert.strictEqual(added.length, data.length);
        eventCount++;
        dispose(toDispose);
        for (let i = 0; i < data.length; i++) {
            assert.strictEqual(e.added[i] instanceof Breakpoint, true);
            assert.strictEqual(e.added[i].lineNumber, data[i].lineNumber);
        }
    });
    const bps = model.addBreakpoints(uri, data);
    assert.strictEqual(eventCount, 1);
    return bps;
}
suite('Debug - Breakpoints', () => {
    let model;
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
        const update = new Map();
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
        const data = new Map();
        assert.strictEqual(breakpoints[0].lineNumber, 5);
        assert.strictEqual(breakpoints[1].lineNumber, 10);
        data.set(breakpoints[0].getId(), { verified: false, line: 10 });
        data.set(breakpoints[1].getId(), { verified: true, line: 50 });
        model.setBreakpointSessionData(session.getId(), {}, data);
        assert.strictEqual(breakpoints[0].lineNumber, 5);
        assert.strictEqual(breakpoints[1].lineNumber, 50);
        const session2 = disposables.add(createTestSession(model));
        const data2 = new Map();
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
        const data3 = new Map();
        data3.set(breakpoints[0].getId(), { verified: true, line: 500 });
        model.setBreakpointSessionData(session2.getId(), { supportsConditionalBreakpoints: true }, data2);
        assert.strictEqual(breakpoints[0].supported, true);
    });
    test('exception breakpoints', () => {
        let eventCount = 0;
        disposables.add(model.onDidChangeBreakpoints(() => eventCount++));
        model.setExceptionBreakpointsForSession('session-id-1', [{ filter: 'uncaught', label: 'UNCAUGHT', default: true }]);
        assert.strictEqual(eventCount, 1);
        let exceptionBreakpoints = model.getExceptionBreakpointsForSession('session-id-1');
        assert.strictEqual(exceptionBreakpoints.length, 1);
        assert.strictEqual(exceptionBreakpoints[0].filter, 'uncaught');
        assert.strictEqual(exceptionBreakpoints[0].enabled, true);
        model.setExceptionBreakpointsForSession('session-id-2', [{ filter: 'uncaught', label: 'UNCAUGHT' }, { filter: 'caught', label: 'CAUGHT' }]);
        assert.strictEqual(eventCount, 2);
        exceptionBreakpoints = model.getExceptionBreakpointsForSession('session-id-2');
        assert.strictEqual(exceptionBreakpoints.length, 2);
        assert.strictEqual(exceptionBreakpoints[0].filter, 'uncaught');
        assert.strictEqual(exceptionBreakpoints[0].enabled, true);
        assert.strictEqual(exceptionBreakpoints[1].filter, 'caught');
        assert.strictEqual(exceptionBreakpoints[1].label, 'CAUGHT');
        assert.strictEqual(exceptionBreakpoints[1].enabled, false);
        model.setExceptionBreakpointsForSession('session-id-3', [{ filter: 'all', label: 'ALL' }]);
        assert.strictEqual(eventCount, 3);
        assert.strictEqual(model.getExceptionBreakpointsForSession('session-id-3').length, 1);
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
        model.setExceptionBreakpointsForSession('session-id-4', [{ filter: 'uncaught', label: 'UNCAUGHT', default: true }, { filter: 'caught', label: 'CAUGHT' }]);
        model.setExceptionBreakpointFallbackSession('session-id-4');
        assert.strictEqual(eventCount, 1);
        let exceptionBreakpointsForSession = model.getExceptionBreakpointsForSession('session-id-4');
        assert.strictEqual(exceptionBreakpointsForSession.length, 2);
        assert.strictEqual(exceptionBreakpointsForSession[0].filter, 'uncaught');
        assert.strictEqual(exceptionBreakpointsForSession[1].filter, 'caught');
        model.setExceptionBreakpointsForSession('session-id-5', [{ filter: 'all', label: 'ALL' }, { filter: 'caught', label: 'CAUGHT' }]);
        assert.strictEqual(eventCount, 2);
        exceptionBreakpointsForSession = model.getExceptionBreakpointsForSession('session-id-5');
        let exceptionBreakpointsForUndefined = model.getExceptionBreakpointsForSession(undefined);
        assert.strictEqual(exceptionBreakpointsForSession.length, 2);
        assert.strictEqual(exceptionBreakpointsForSession[0].filter, 'caught');
        assert.strictEqual(exceptionBreakpointsForSession[1].filter, 'all');
        assert.strictEqual(exceptionBreakpointsForUndefined.length, 2);
        assert.strictEqual(exceptionBreakpointsForUndefined[0].filter, 'uncaught');
        assert.strictEqual(exceptionBreakpointsForUndefined[1].filter, 'caught');
        model.removeExceptionBreakpointsForSession('session-id-4');
        assert.strictEqual(eventCount, 2);
        exceptionBreakpointsForUndefined = model.getExceptionBreakpointsForSession(undefined);
        assert.strictEqual(exceptionBreakpointsForUndefined.length, 2);
        assert.strictEqual(exceptionBreakpointsForUndefined[0].filter, 'uncaught');
        assert.strictEqual(exceptionBreakpointsForUndefined[1].filter, 'caught');
        model.setExceptionBreakpointFallbackSession('session-id-5');
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
        model.addDataBreakpoint({ description: 'label', src: { type: 0 /* DataBreakpointSetType.Variable */, dataId: 'id' }, canPersist: true, accessTypes: ['read'], accessType: 'read' }, '1');
        model.addDataBreakpoint({ description: 'second', src: { type: 0 /* DataBreakpointSetType.Variable */, dataId: 'secondId' }, canPersist: false, accessTypes: ['readWrite'], accessType: 'readWrite' }, '2');
        model.updateDataBreakpoint('1', { condition: 'aCondition' });
        model.updateDataBreakpoint('2', { hitCondition: '10' });
        const dataBreakpoints = model.getDataBreakpoints();
        assert.strictEqual(dataBreakpoints[0].canPersist, true);
        assert.deepStrictEqual(dataBreakpoints[0].src, { type: 0 /* DataBreakpointSetType.Variable */, dataId: 'id' });
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
        let result = getBreakpointMessageAndIcon(2 /* State.Stopped */, true, breakpoints[0], ls, model);
        assert.strictEqual(result.message, 'Condition: x > 5');
        assert.strictEqual(result.icon.id, 'debug-breakpoint-conditional');
        result = getBreakpointMessageAndIcon(2 /* State.Stopped */, true, breakpoints[1], ls, model);
        assert.strictEqual(result.message, 'Disabled Breakpoint');
        assert.strictEqual(result.icon.id, 'debug-breakpoint-disabled');
        result = getBreakpointMessageAndIcon(2 /* State.Stopped */, true, breakpoints[2], ls, model);
        assert.strictEqual(result.message, 'Log Message: hello');
        assert.strictEqual(result.icon.id, 'debug-breakpoint-log');
        result = getBreakpointMessageAndIcon(2 /* State.Stopped */, true, breakpoints[3], ls, model);
        assert.strictEqual(result.message, 'Hit Count: 12');
        assert.strictEqual(result.icon.id, 'debug-breakpoint-conditional');
        result = getBreakpointMessageAndIcon(2 /* State.Stopped */, true, breakpoints[4], ls, model);
        assert.strictEqual(result.message, ls.getUriLabel(breakpoints[4].uri));
        assert.strictEqual(result.icon.id, 'debug-breakpoint');
        result = getBreakpointMessageAndIcon(2 /* State.Stopped */, false, breakpoints[2], ls, model);
        assert.strictEqual(result.message, 'Disabled Logpoint');
        assert.strictEqual(result.icon.id, 'debug-breakpoint-log-disabled');
        model.addDataBreakpoint({ description: 'label', canPersist: true, accessTypes: ['read'], accessType: 'read', src: { type: 0 /* DataBreakpointSetType.Variable */, dataId: 'id' } });
        const dataBreakpoints = model.getDataBreakpoints();
        result = getBreakpointMessageAndIcon(2 /* State.Stopped */, true, dataBreakpoints[0], ls, model);
        assert.strictEqual(result.message, 'Data Breakpoint');
        assert.strictEqual(result.icon.id, 'debug-breakpoint-data');
        const functionBreakpoint = model.addFunctionBreakpoint({ name: 'foo' }, '1');
        result = getBreakpointMessageAndIcon(2 /* State.Stopped */, true, functionBreakpoint, ls, model);
        assert.strictEqual(result.message, 'Function Breakpoint');
        assert.strictEqual(result.icon.id, 'debug-breakpoint-function');
        const data = new Map();
        data.set(breakpoints[0].getId(), { verified: false, line: 10 });
        data.set(breakpoints[1].getId(), { verified: true, line: 50 });
        data.set(breakpoints[2].getId(), { verified: true, line: 50, message: 'world' });
        data.set(functionBreakpoint.getId(), { verified: true });
        model.setBreakpointSessionData('mocksessionid', { supportsFunctionBreakpoints: false, supportsDataBreakpoints: true, supportsLogPoints: true }, data);
        result = getBreakpointMessageAndIcon(2 /* State.Stopped */, true, breakpoints[0], ls, model);
        assert.strictEqual(result.message, 'Unverified Breakpoint');
        assert.strictEqual(result.icon.id, 'debug-breakpoint-unverified');
        result = getBreakpointMessageAndIcon(2 /* State.Stopped */, true, functionBreakpoint, ls, model);
        assert.strictEqual(result.message, 'Function breakpoints not supported by this debug type');
        assert.strictEqual(result.icon.id, 'debug-breakpoint-function-unverified');
        result = getBreakpointMessageAndIcon(2 /* State.Stopped */, true, breakpoints[2], ls, model);
        assert.strictEqual(result.message, 'Log Message: hello, world');
        assert.strictEqual(result.icon.id, 'debug-breakpoint-log');
    });
    test('decorations', () => {
        const modelUri = uri.file('/myfolder/my file first.js');
        const languageId = 'testMode';
        const textModel = createTextModel(['this is line one', 'this is line two', '    this is line three it has whitespace at start', 'this is line four', 'this is line five'].join('\n'), languageId);
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
        let decorations = instantiationService.invokeFunction(accessor => createBreakpointDecorations(accessor, textModel, breakpoints, 3 /* State.Running */, true, true));
        assert.strictEqual(decorations.length, 3); // last breakpoint filtered out since it has a large line number
        assert.deepStrictEqual(decorations[0].range, new Range(1, 1, 1, 2));
        assert.deepStrictEqual(decorations[1].range, new Range(2, 4, 2, 5));
        assert.deepStrictEqual(decorations[2].range, new Range(3, 5, 3, 6));
        assert.strictEqual(decorations[0].options.beforeContentClassName, undefined);
        assert.strictEqual(decorations[1].options.before?.inlineClassName, `debug-breakpoint-placeholder`);
        assert.strictEqual(decorations[0].options.overviewRuler?.position, OverviewRulerLane.Left);
        const expected = new MarkdownString(undefined, { isTrusted: true, supportThemeIcons: true }).appendCodeblock(languageId, 'Condition: x > 5');
        assert.deepStrictEqual(decorations[0].options.glyphMarginHoverMessage, expected);
        decorations = instantiationService.invokeFunction(accessor => createBreakpointDecorations(accessor, textModel, breakpoints, 3 /* State.Running */, true, false));
        assert.strictEqual(decorations[0].options.overviewRuler, null);
        textModel.dispose();
        instantiationService.dispose();
    });
    test('updates when storage changes', () => {
        const storage1 = disposables.add(new TestStorageService());
        const debugStorage1 = disposables.add(new MockDebugStorage(storage1));
        // eslint-disable-next-line local/code-no-any-casts
        const model1 = disposables.add(new DebugModel(debugStorage1, { isDirty: (e) => false }, mockUriIdentityService, new NullLogService()));
        // 1. create breakpoints in the first model
        const modelUri = uri.file('/myfolder/my file first.js');
        const first = [
            { lineNumber: 1, enabled: true, condition: 'x > 5' },
            { lineNumber: 2, column: 4, enabled: false },
        ];
        addBreakpointsAndCheckEvents(model1, modelUri, first);
        debugStorage1.storeBreakpoints(model1);
        const stored = storage1.get('debug.breakpoint', 1 /* StorageScope.WORKSPACE */);
        // 2. hydrate a new model and ensure external breakpoints get applied
        const storage2 = disposables.add(new TestStorageService());
        // eslint-disable-next-line local/code-no-any-casts
        const model2 = disposables.add(new DebugModel(disposables.add(new MockDebugStorage(storage2)), { isDirty: (e) => false }, mockUriIdentityService, new NullLogService()));
        storage2.store('debug.breakpoint', stored, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */, /* external= */ true);
        assert.deepStrictEqual(model2.getBreakpoints().map(b => b.getId()), model1.getBreakpoints().map(b => b.getId()));
        // 3. ensure non-external changes are ignored
        storage2.store('debug.breakpoint', '[]', 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */, /* external= */ false);
        assert.deepStrictEqual(model2.getBreakpoints().map(b => b.getId()), model1.getBreakpoints().map(b => b.getId()));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJlYWtwb2ludHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL3Rlc3QvYnJvd3Nlci9icmVha3BvaW50cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxHQUFHLElBQUksR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDckYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUUzRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM1RixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRyxPQUFPLEVBQWlFLGFBQWEsRUFB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LFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFbEQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMvRCxLQUFLLENBQUMsd0JBQXdCLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWxELE1BQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUMzRCxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsRUFBb0MsQ0FBQztRQUMxRCxLQUFLLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDakUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFF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