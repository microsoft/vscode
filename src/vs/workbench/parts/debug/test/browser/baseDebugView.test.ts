/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { replaceWhitespace, renderExpressionValue, renderVariable } from 'vs/workbench/parts/debug/browser/baseDebugView';
import * as dom from 'vs/base/browser/dom';
import { Expression, Variable, Scope, StackFrame, Thread } from 'vs/workbench/parts/debug/common/debugModel';
import { MockSession } from 'vs/workbench/parts/debug/test/common/mockDebug';
const $ = dom.$;

suite('Debug - Base Debug View', () => {

	test('replace whitespace', () => {
		assert.equal(replaceWhitespace('hey there'), 'hey there');
		assert.equal(replaceWhitespace('hey there\n'), 'hey there\\n');
		assert.equal(replaceWhitespace('hey \r there\n\t'), 'hey \\r there\\n\\t');
		assert.equal(replaceWhitespace('hey \r\t\n\t\t\n there'), 'hey \\r\\t\\n\\t\\t\\n there');
	});

	test('render expression value', () => {
		let container = $('.container');
		renderExpressionValue('render \n me', container, { showHover: true, preserveWhitespace: true });
		assert.equal(container.className, 'value');
		assert.equal(container.title, 'render \n me');
		assert.equal(container.textContent, 'render \n me');

		const expression = new Expression('console');
		expression.value = 'Object';
		container = $('.container');
		renderExpressionValue(expression, container, { colorize: true });
		assert.equal(container.className, 'value unavailable error');

		expression.available = true;
		expression.value = '"string value"';
		container = $('.container');
		renderExpressionValue(expression, container, { colorize: true });
		assert.equal(container.className, 'value string');
		assert.equal(container.textContent, '"string value"');

		expression.type = 'boolean';
		container = $('.container');
		renderExpressionValue(expression, container, { colorize: true });
		assert.equal(container.className, 'value boolean');
		assert.equal(container.textContent, expression.value);

		expression.value = 'this is a long string';
		container = $('.container');
		renderExpressionValue(expression, container, { colorize: true, maxValueLength: 4 });
		assert.equal(container.textContent, 'this...');
	});

	test('render variable', () => {
		const session = new MockSession();
		const thread = new Thread(session, 'mockthread', 1);
		const stackFrame = new StackFrame(thread, 1, null, 'app.js', 'normal', { startLineNumber: 1, startColumn: 1, endLineNumber: undefined, endColumn: undefined }, 0);
		const scope = new Scope(stackFrame, 1, 'local', 1, false, 10, 10);

		let variable = new Variable(session, scope, 2, 'foo', 'bar.foo', undefined, 0, 0, {}, 'string');
		let expression = $('.');
		let name = $('.');
		let value = $('.');
		renderVariable(variable, { expression, name, value }, false);

		assert.equal(name.textContent, 'foo');
		assert.equal(value.textContent, '');
		assert.equal(value.title, '');

		variable.value = 'hey';
		expression = $('.');
		name = $('.');
		value = $('.');
		renderVariable(variable, { expression, name, value }, false);
		assert.equal(value.textContent, 'hey');
		assert.equal(name.textContent, 'foo:');
		assert.equal(name.title, 'string');

		variable = new Variable(session, scope, 2, 'console', 'console', '5', 0, 0, { kind: 'virtual' });
		expression = $('.');
		name = $('.');
		value = $('.');
		renderVariable(variable, { expression, name, value }, false);
		assert.equal(name.className, 'virtual');
		assert.equal(name.textContent, 'console:');
		assert.equal(name.title, 'console');
		assert.equal(value.className, 'value number');
	});
});
