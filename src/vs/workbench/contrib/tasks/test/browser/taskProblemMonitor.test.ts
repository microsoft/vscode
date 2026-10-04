/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { IMarker, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { TaskProblemMonitor } from '../../browser/taskProblemMonitor.js';
import { AbstractProblemCollector } from '../../common/problemCollectors.js';

suite('TaskProblemMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createMonitor() {
		const errors = store.add(new Emitter<IMarker[]>());
		const invalidated = store.add(new Emitter<void>());
		const disposed = store.add(new Emitter<ITerminalInstance>());
		const monitor = store.add(new TaskProblemMonitor());
		// The existing monitor does not register its map for disposal.
		store.add(Reflect.get(monitor, 'terminalDisposables') as IDisposable);
		monitor.addTerminal(upcastPartial<ITerminalInstance>({ instanceId: 1, onDisposed: disposed.event }), upcastPartial<AbstractProblemCollector>({ onDidFindErrors: errors.event, onDidRequestInvalidateLastMarker: invalidated.event }));
		return { errors, invalidated, disposed, monitor };
	}

	function marker(message: string, line: number, resource = URI.file('/a.ts'), owner = 'compiler'): IMarker {
		return { owner, resource, message, startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 2, severity: MarkerSeverity.Error };
	}

	test('retains distinct errors on the same file and their resource associations', () => {
		const { errors, disposed, monitor } = createMonitor();
		try {
			errors.fire([marker('first', 1), marker('second', 2), marker('other file', 1, URI.file('/b.ts'))]);
			const result = monitor.getTaskProblems(1)!.get('compiler')!;
			assert.deepStrictEqual(result.markers.map((m, i) => [m.message, result.resources[i].path]), [['first', '/a.ts'], ['second', '/a.ts'], ['other file', '/b.ts']]);
		} finally {
			disposed.fire(undefined!);
		}
	});

	test('deduplicates identical markers while preserving owners and different messages', () => {
		const { errors, disposed, monitor } = createMonitor();
		try {
			errors.fire([marker('first', 1), marker('first', 1), marker('different message', 1), marker('first', 1, URI.file('/a.ts'), 'other')]);
			assert.deepStrictEqual([...monitor.getTaskProblems(1)!].map(([owner, data]) => [owner, data.markers.map(m => m.message)]), [['compiler', ['first', 'different message']], ['other', ['first']]]);
		} finally {
			disposed.fire(undefined!);
		}
	});

	test('replaces previous cycle errors, ignores warnings, and clears invalidated results', () => {
		const { errors, invalidated, disposed, monitor } = createMonitor();
		try {
			errors.fire([marker('old', 1)]);
			errors.fire([marker('new', 2), { ...marker('warning', 3), severity: MarkerSeverity.Warning }]);
			assert.deepStrictEqual(monitor.getTaskProblems(1)!.get('compiler')!.markers.map(m => m.message), ['new']);
			invalidated.fire();
			assert.strictEqual(monitor.getTaskProblems(1)!.size, 0);
		} finally {
			disposed.fire(undefined!);
		}
		assert.strictEqual(monitor.getTaskProblems(1), undefined);
	});
});
