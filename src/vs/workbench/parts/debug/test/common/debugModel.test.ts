/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import uri from 'vs/base/common/uri';
import severity from 'vs/base/common/severity';
import debugmodel = require('vs/workbench/parts/debug/common/debugModel');

suite('Debug - Model', () => {
	var model: debugmodel.Model;

	setup(() => {
		model = new debugmodel.Model([], true, [], [], []);
	});

	teardown(() => {
		model = null;
	});

	// Breakpoints

	test('breakpoints simple', () => {
		var modelUri = uri.file('/myfolder/myfile.js');
		model.addBreakpoints([{ uri: modelUri, lineNumber: 5, enabled: true }, { uri: modelUri, lineNumber: 10, enabled: false }]);
		assert.equal(model.areBreakpointsActivated(), true);
		assert.equal(model.getBreakpoints().length, 2);

		model.removeBreakpoints(model.getBreakpoints());
		assert.equal(model.getBreakpoints().length, 0);
	});

	test('breakpoints toggling', () => {
		var modelUri = uri.file('/myfolder/myfile.js');
		model.addBreakpoints([{ uri: modelUri, lineNumber: 5, enabled: true }, { uri: modelUri, lineNumber: 10, enabled: false }]);
		model.addBreakpoints([{ uri: modelUri, lineNumber: 12, enabled: true, condition: 'fake condition'}]);
		assert.equal(model.getBreakpoints().length, 3);
		model.removeBreakpoints([model.getBreakpoints().pop()]);
		assert.equal(model.getBreakpoints().length, 2);

		model.toggleBreakpointsActivated();
		assert.equal(model.areBreakpointsActivated(), false);
		model.toggleBreakpointsActivated();
		assert.equal(model.areBreakpointsActivated(), true);
	});

	test('breakpoints two files', () => {
		var modelUri1 = uri.file('/myfolder/my file first.js');
		var modelUri2 = uri.file('/secondfolder/second/second file.js')
		model.addBreakpoints([{ uri: modelUri1, lineNumber: 5, enabled: true }, { uri: modelUri1, lineNumber: 10, enabled: false }]);
		model.addBreakpoints([{ uri: modelUri2, lineNumber: 1, enabled: true }, { uri: modelUri2, lineNumber: 2, enabled: true }, { uri: modelUri2, lineNumber: 3, enabled: false }]);

		assert.equal(model.getBreakpoints().length, 5);
		var bp = model.getBreakpoints()[0];
		var originalLineLumber = bp.lineNumber;
		const update:any = {};
		update[bp.getId()] = { line: 100, verified: false };
		model.updateBreakpoints(update);
		assert.equal(bp.lineNumber, 100);
		assert.equal(bp.desiredLineNumber, originalLineLumber);

		model.enableOrDisableAllBreakpoints(false);
		model.getBreakpoints().forEach(bp => {
			assert.equal(bp.enabled, false);
		});
		model.toggleEnablement(bp);
		assert.equal(bp.enabled, true);

		model.removeBreakpoints(model.getBreakpoints().filter(bp => bp.source.uri.toString() === modelUri1.toString()));
		assert.equal(model.getBreakpoints().length, 3);
	});

	// Threads

	test('threads simple', () => {
		var threadId = 1;
		var threadName = "firstThread";
		model.rawUpdate({
			threadId: threadId,
			thread: {
				id: threadId,
				name: threadName
			}
		});

		var threads = model.getThreads();
		assert.equal(threads[threadId].name, threadName);

		model.clearThreads(true);
		assert.equal(model.getThreads[threadId], null);
	});

	// Expressions

	function assertWatchExpressions(watchExpressions: debugmodel.Expression[], expectedName: string) {
		assert.equal(watchExpressions.length, 2);
		watchExpressions.forEach(we => {
			assert.equal(we.available, false);
			assert.equal(we.reference, 0);
			assert.equal(we.name, expectedName);
		});
	}

	test('watch expressions', () => {
		assert.equal(model.getWatchExpressions().length, 0);
		const stackFrame = new debugmodel.StackFrame(1, 1, null, 'app.js', 1, 1);
		model.addWatchExpression(null, stackFrame, 'console').done();
		model.addWatchExpression(null, stackFrame, 'console').done();
		const watchExpressions = model.getWatchExpressions();
		assertWatchExpressions(watchExpressions, 'console');

		model.renameWatchExpression(null, stackFrame, watchExpressions[0].getId(), 'new_name').done();
		model.renameWatchExpression(null, stackFrame, watchExpressions[1].getId(), 'new_name').done();
		assertWatchExpressions(model.getWatchExpressions(), 'new_name');

		model.clearWatchExpressionValues();
		assertWatchExpressions(model.getWatchExpressions(), 'new_name');

		model.clearWatchExpressions();
		assert.equal(model.getWatchExpressions().length, 0);
	});

	test('repl expressions', () => {
		assert.equal(model.getReplElements().length, 0);
		const stackFrame = new debugmodel.StackFrame(1, 1, null, 'app.js', 1, 1);
		model.addReplExpression(null, stackFrame, 'myVariable').done();
		model.addReplExpression(null, stackFrame, 'myVariable').done();
		model.addReplExpression(null, stackFrame, 'myVariable').done();

		assert.equal(model.getReplElements().length, 3);
		model.getReplElements().forEach(re => {
			assert.equal((<debugmodel.Expression> re).available, false);
			assert.equal((<debugmodel.Expression> re).name, 'myVariable');
			assert.equal((<debugmodel.Expression> re).reference, 0);
		});

		model.clearReplExpressions();
		assert.equal(model.getReplElements().length, 0);
	});

	// Repl output

	test('repl output', () => {
		model.logToRepl('first line', severity.Error);
		model.logToRepl('second line', severity.Warning);
		model.logToRepl('second line', severity.Warning);
		model.logToRepl('second line', severity.Error);

		let elements = <debugmodel.ValueOutputElement[]> model.getReplElements();
		assert.equal(elements.length, 3);
		assert.equal(elements[0].value, 'first line');
		assert.equal(elements[0].counter, 1);
		assert.equal(elements[0].severity, severity.Error);
		assert.equal(elements[1].value, 'second line');
		assert.equal(elements[1].counter, 2);
		assert.equal(elements[1].severity, severity.Warning);

		model.appendReplOutput('1', severity.Error);
		model.appendReplOutput('2', severity.Error);
		model.appendReplOutput('3', severity.Error);
		elements = <debugmodel.ValueOutputElement[]> model.getReplElements();
		assert.equal(elements.length, 4);
		assert.equal(elements[3].value, '123');
		assert.equal(elements[3].severity, severity.Error);

		const keyValueObject = { 'key1' : 2, 'key2': 'value' };
		model.logToRepl(keyValueObject);
		const element = <debugmodel.KeyValueOutputElement> model.getReplElements()[4];
		assert.equal(element.value, 'Object');
		assert.deepEqual(element.valueObj, keyValueObject);

		model.clearReplExpressions();
		assert.equal(model.getReplElements().length, 0);
	});

	// Utils

	test('full expression name', () => {
		const type = 'node';
		assert.equal(debugmodel.getFullExpressionName(new debugmodel.Expression(null, false), type), null);
		assert.equal(debugmodel.getFullExpressionName(new debugmodel.Expression('son', false), type), 'son');

		const scope = new debugmodel.Scope(1, 'myscope', 1, false);
		const son = new debugmodel.Variable(new debugmodel.Variable(new debugmodel.Variable(scope, 0, 'grandfather', '75'), 0, 'father', '45'), 0, 'son', '20');
		assert.equal(debugmodel.getFullExpressionName(son, type), 'grandfather.father.son');

		const grandson = new debugmodel.Variable(son, 0, '/weird_name', '1');
		assert.equal(debugmodel.getFullExpressionName(grandson, type), 'grandfather.father.son[\'/weird_name\']');
	});
});
