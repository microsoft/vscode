/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import uri from 'vs/base/common/uri';
import debug = require('vs/workbench/parts/debug/common/debug');
import debugmodel = require('vs/workbench/parts/debug/common/debugModel');

suite('Debug - Model', () => {
	var model: debugmodel.Model;

	setup(() => {
		model = new debugmodel.Model([], true, [], []);
	});

	teardown(() => {
		model = null;
	});

	// Breakpoints

	test('breakpoints simple', () => {
		var modelUri = uri.file('/myfolder/myfile.js');
		model.setBreakpointsForModel(modelUri, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		assert.equal(model.areBreakpointsActivated(), true);
		assert.equal(model.getBreakpoints().length, 2);

		model.clearBreakpoints(modelUri);
		assert.equal(model.getBreakpoints().length, 0);
	});

	test('breakpoints toggling', () => {
		var modelUri = uri.file('/myfolder/myfile.js');
		model.setBreakpointsForModel(modelUri, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		model.toggleBreakpoint(modelUri, 12);
		assert.equal(model.getBreakpoints().length, 3);
		model.toggleBreakpoint(modelUri, 10);
		assert.equal(model.getBreakpoints().length, 2);

		model.toggleBreakpointsActivated();
		assert.equal(model.areBreakpointsActivated(), false);
		model.toggleBreakpointsActivated();
		assert.equal(model.areBreakpointsActivated(), true);
	});

	test('breakpoints two files', () => {
		var modelUri1 = uri.file('/myfolder/my file first.js');
		var modelUri2 = uri.file('/secondfolder/second/second file.js')
		model.setBreakpointsForModel(modelUri1, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		model.setBreakpointsForModel(modelUri2, [{ lineNumber: 1, enabled: true }, { lineNumber: 2, enabled: true }, { lineNumber: 3, enabled: false }]);

		assert.equal(model.getBreakpoints().length, 5);
		var bp = model.getBreakpoints()[0];
		var originalLineLumber = bp.lineNumber;
		model.setBreakpointLineNumber(bp, 100);
		assert.equal(bp.lineNumber, 100);
		assert.equal(bp.desiredLineNumber, originalLineLumber);

		model.enableOrDisableAllBreakpoints(false);
		model.getBreakpoints().forEach(bp => {
			assert.equal(bp.enabled, false);
		});
		model.toggleEnablement(bp);
		assert.equal(bp.enabled, true);

		model.clearBreakpoints(modelUri1);
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
});
