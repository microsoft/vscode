/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { renderExpressionValue, renderVariable, renderViewTree } from 'vs/workbench/contrib/debug/browser/baseDebugView';
import * as dom from 'vs/base/browser/dom';
import { Expression, Variable, Scope, StackFrame, Thread } from 'vs/workbench/contrib/debug/common/debugModel';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { createMockSession } from 'vs/workbench/contrib/debug/test/browser/callStack.test';
import { isStatusbarInDebugMode } from 'vs/workbench/contrib/debug/browser/statusbarColorProvider';
import { State } from 'vs/workbench/contrib/debug/common/debug';
import { isWindows } from 'vs/base/common/platform';
import { MockSession, createMockDebugModel } from 'vs/workbench/contrib/debug/test/browser/mockDebug';
const $ = dom.$;

suite('Debug - Base Debug View', () => {
	let linkDetector: LinkDetector;

	/**
	 * Instantiate services for use by the functions being tested.
	 */
	setup(() => {
		const instantiationService: TestInstantiationService = <TestInstantiationService>workbenchInstantiationService();
		linkDetector = instantiationService.createInstance(LinkDetector);
	});

	test('render view tree', () => {
		const container = $('.container');
		const treeContainer = renderViewTree(container);

		assert.strictEqual(treeContainer.className, 'debug-view-content');
		assert.strictEqual(container.childElementCount, 1);
		assert.strictEqual(container.firstChild, treeContainer);
		assert.strictEqual(treeContainer instanceof HTMLDivElement, true);
	});

	test('render expression value', () => {
		let container = $('.container');
		renderExpressionValue('render \n me', container, { showHover: true });
		assert.strictEqual(container.className, 'value');
		assert.strictEqual(container.title, 'render \n me');
		assert.strictEqual(container.textContent, 'render \n me');

		const expression = new Expression('console');
		expression.value = 'Object';
		container = $('.container');
		renderExpressionValue(expression, container, { colorize: true });
		assert.strictEqual(container.className, 'value unavailable error');

		expression.available = true;
		expression.value = '"string value"';
		container = $('.container');
		renderExpressionValue(expression, container, { colorize: true, linkDetector });
		assert.strictEqual(container.className, 'value string');
		assert.strictEqual(container.textContent, '"string value"');

		expression.type = 'boolean';
		container = $('.container');
		renderExpressionValue(expression, container, { colorize: true });
		assert.strictEqual(container.className, 'value boolean');
		assert.strictEqual(container.textContent, expression.value);

		expression.value = 'this is a long string';
		container = $('.container');
		renderExpressionValue(expression, container, { colorize: true, maxValueLength: 4, linkDetector });
		assert.strictEqual(container.textContent, 'this...');

		expression.value = isWindows ? 'C:\\foo.js:5' : '/foo.js:5';
		container = $('.container');
		renderExpressionValue(expression, container, { colorize: true, linkDetector });
		assert.ok(container.querySelector('a'));
		assert.strictEqual(container.querySelector('a')!.textContent, expression.value);
	});

	test('render variable', () => {
		const session = new MockSession();
		const thread = new Thread(session, 'mockthread', 1);
		const stackFrame = new StackFrame(thread, 1, null!, 'app.js', 'normal', { startLineNumber: 1, startColumn: 1, endLineNumber: undefined!, endColumn: undefined! }, 0, true);
		const scope = new Scope(stackFrame, 1, 'local', 1, false, 10, 10);

		let variable = new Variable(session, 1, scope, 2, 'foo', 'bar.foo', undefined!, 0, 0, {}, 'string');
		let expression = $('.');
		let name = $('.');
		let value = $('.');
		let label = new HighlightedLabel(name, false);
		renderVariable(variable, { expression, name, value, label }, false, []);

		assert.strictEqual(label.element.textContent, 'foo');
		assert.strictEqual(value.textContent, '');
		assert.strictEqual(value.title, '');

		variable.value = 'hey';
		expression = $('.');
		name = $('.');
		value = $('.');
		renderVariable(variable, { expression, name, value, label }, false, [], linkDetector);
		assert.strictEqual(value.textContent, 'hey');
		assert.strictEqual(label.element.textContent, 'foo:');
		assert.strictEqual(label.element.title, 'string');

		variable.value = isWindows ? 'C:\\foo.js:5' : '/foo.js:5';
		expression = $('.');
		name = $('.');
		value = $('.');
		renderVariable(variable, { expression, name, value, label }, false, [], linkDetector);
		assert.ok(value.querySelector('a'));
		assert.strictEqual(value.querySelector('a')!.textContent, variable.value);

		variable = new Variable(session, 1, scope, 2, 'console', 'console', '5', 0, 0, { kind: 'virtual' });
		expression = $('.');
		name = $('.');
		value = $('.');
		renderVariable(variable, { expression, name, value, label }, false, [], linkDetector);
		assert.strictEqual(name.className, 'virtual');
		assert.strictEqual(label.element.textContent, 'console:');
		assert.strictEqual(label.element.title, 'console');
		assert.strictEqual(value.className, 'value number');
	});

	test('statusbar in debug mode', () => {
		const model = createMockDebugModel();
		const session = createMockSession(model);
		assert.strictEqual(isStatusbarInDebugMode(State.Inactive, undefined), false);
		assert.strictEqual(isStatusbarInDebugMode(State.Initializing, session), false);
		assert.strictEqual(isStatusbarInDebugMode(State.Running, session), true);
		assert.strictEqual(isStatusbarInDebugMode(State.Stopped, session), true);
		session.configuration.noDebug = true;
		assert.strictEqual(isStatusbarInDebugMode(State.Running, session), false);
	});
});
