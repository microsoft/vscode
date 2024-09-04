/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullCommandService } from '../../../../../platform/commands/test/common/nullCommandService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { renderExpressionValue, renderVariable, renderViewTree } from '../../browser/baseDebugView.js';
import { LinkDetector } from '../../browser/linkDetector.js';
import { isStatusbarInDebugMode } from '../../browser/statusbarColorProvider.js';
import { State } from '../../common/debug.js';
import { Expression, Scope, StackFrame, Thread, Variable } from '../../common/debugModel.js';
import { createTestSession } from './callStack.test.js';
import { createMockDebugModel } from './mockDebugModel.js';
import { MockSession } from '../common/mockDebug.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
const $ = dom.$;

function assertVariable(session: MockSession, scope: Scope, disposables: Pick<DisposableStore, "add">, linkDetector: LinkDetector, displayType: boolean) {
	let variable = new Variable(session, 1, scope, 2, 'foo', 'bar.foo', undefined, 0, 0, undefined, {}, 'string');
	let expression = $('.');
	let name = $('.');
	let type = $('.');
	let value = $('.');
	const label = new HighlightedLabel(name);
	const lazyButton = $('.');
	const store = disposables.add(new DisposableStore());
	renderVariable(store, NullCommandService, NullHoverService, variable, { expression, name, type, value, label, lazyButton }, false, [], undefined, displayType);

	assert.strictEqual(label.element.textContent, 'foo');
	assert.strictEqual(value.textContent, '');

	variable.value = 'hey';
	expression = $('.');
	name = $('.');
	type = $('.');
	value = $('.');
	renderVariable(store, NullCommandService, NullHoverService, variable, { expression, name, type, value, label, lazyButton }, false, [], linkDetector, displayType);
	assert.strictEqual(value.textContent, 'hey');
	assert.strictEqual(label.element.textContent, displayType ? 'foo: ' : 'foo =');
	assert.strictEqual(type.textContent, displayType ? 'string =' : '');

	variable.value = isWindows ? 'C:\\foo.js:5' : '/foo.js:5';
	expression = $('.');
	name = $('.');
	type = $('.');
	value = $('.');
	renderVariable(store, NullCommandService, NullHoverService, variable, { expression, name, type, value, label, lazyButton }, false, [], linkDetector, displayType);
	assert.ok(value.querySelector('a'));
	assert.strictEqual(value.querySelector('a')!.textContent, variable.value);

	variable = new Variable(session, 1, scope, 2, 'console', 'console', '5', 0, 0, undefined, { kind: 'virtual' });
	expression = $('.');
	name = $('.');
	type = $('.');
	value = $('.');
	renderVariable(store, NullCommandService, NullHoverService, variable, { expression, name, type, value, label, lazyButton }, false, [], linkDetector, displayType);
	assert.strictEqual(name.className, 'virtual');
	assert.strictEqual(label.element.textContent, 'console =');
	assert.strictEqual(value.className, 'value number');

	variable = new Variable(session, 1, scope, 2, 'xpto', 'xpto.xpto', undefined, 0, 0, undefined, {}, 'custom-type');
	renderVariable(store, NullCommandService, NullHoverService, variable, { expression, name, type, value, label, lazyButton }, false, [], linkDetector, displayType);
	assert.strictEqual(label.element.textContent, 'xpto');
	assert.strictEqual(value.textContent, '');
	variable.value = '2';
	expression = $('.');
	name = $('.');
	type = $('.');
	value = $('.');
	renderVariable(store, NullCommandService, NullHoverService, variable, { expression, name, type, value, label, lazyButton }, false, [], linkDetector, displayType);
	assert.strictEqual(value.textContent, '2');
	assert.strictEqual(label.element.textContent, displayType ? 'xpto: ' : 'xpto =');
	assert.strictEqual(type.textContent, displayType ? 'custom-type =' : '');

	label.dispose();
}

suite('Debug - Base Debug View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let linkDetector: LinkDetector;

	/**
	 * Instantiate services for use by the functions being tested.
	 */
	setup(() => {
		const instantiationService: TestInstantiationService = workbenchInstantiationService(undefined, disposables);
		linkDetector = instantiationService.createInstance(LinkDetector);
		instantiationService.stub(IHoverService, NullHoverService);
	});

	test('render view tree', () => {
		const container = $('.container');
		const treeContainer = renderViewTree(container);

		assert.strictEqual(treeContainer.className, 'debug-view-content');
		assert.strictEqual(container.childElementCount, 1);
		assert.strictEqual(container.firstChild, treeContainer);
		assert.strictEqual(dom.isHTMLDivElement(treeContainer), true);
	});

	test('render expression value', () => {
		let container = $('.container');
		const store = disposables.add(new DisposableStore());
		renderExpressionValue(store, 'render \n me', container, {}, NullHoverService);
		assert.strictEqual(container.className, 'value');
		assert.strictEqual(container.textContent, 'render \n me');

		const expression = new Expression('console');
		expression.value = 'Object';
		container = $('.container');
		renderExpressionValue(store, expression, container, { colorize: true }, NullHoverService);
		assert.strictEqual(container.className, 'value unavailable error');

		expression.available = true;
		expression.value = '"string value"';
		container = $('.container');
		renderExpressionValue(store, expression, container, { colorize: true, linkDetector }, NullHoverService);
		assert.strictEqual(container.className, 'value string');
		assert.strictEqual(container.textContent, '"string value"');

		expression.type = 'boolean';
		container = $('.container');
		renderExpressionValue(store, expression, container, { colorize: true }, NullHoverService);
		assert.strictEqual(container.className, 'value boolean');
		assert.strictEqual(container.textContent, expression.value);

		expression.value = 'this is a long string';
		container = $('.container');
		renderExpressionValue(store, expression, container, { colorize: true, maxValueLength: 4, linkDetector }, NullHoverService);
		assert.strictEqual(container.textContent, 'this...');

		expression.value = isWindows ? 'C:\\foo.js:5' : '/foo.js:5';
		container = $('.container');
		renderExpressionValue(store, expression, container, { colorize: true, linkDetector }, NullHoverService);
		assert.ok(container.querySelector('a'));
		assert.strictEqual(container.querySelector('a')!.textContent, expression.value);
	});

	test('render variable', () => {
		const session = new MockSession();
		const thread = new Thread(session, 'mockthread', 1);
		const range = {
			startLineNumber: 1,
			startColumn: 1,
			endLineNumber: undefined!,
			endColumn: undefined!
		};
		const stackFrame = new StackFrame(thread, 1, null!, 'app.js', 'normal', range, 0, true);
		const scope = new Scope(stackFrame, 1, 'local', 1, false, 10, 10);

		assertVariable(session, scope, disposables, linkDetector, false);

	});

	test('render variable with display type setting', () => {
		const session = new MockSession();
		const thread = new Thread(session, 'mockthread', 1);
		const range = {
			startLineNumber: 1,
			startColumn: 1,
			endLineNumber: undefined!,
			endColumn: undefined!
		};
		const stackFrame = new StackFrame(thread, 1, null!, 'app.js', 'normal', range, 0, true);
		const scope = new Scope(stackFrame, 1, 'local', 1, false, 10, 10);

		assertVariable(session, scope, disposables, linkDetector, true);
	});

	test('statusbar in debug mode', () => {
		const model = createMockDebugModel(disposables);
		const session = disposables.add(createTestSession(model));
		const session2 = disposables.add(createTestSession(model, undefined, { suppressDebugStatusbar: true }));
		assert.strictEqual(isStatusbarInDebugMode(State.Inactive, []), false);
		assert.strictEqual(isStatusbarInDebugMode(State.Initializing, [session]), false);
		assert.strictEqual(isStatusbarInDebugMode(State.Running, [session]), true);
		assert.strictEqual(isStatusbarInDebugMode(State.Stopped, [session]), true);

		assert.strictEqual(isStatusbarInDebugMode(State.Running, [session2]), false);
		assert.strictEqual(isStatusbarInDebugMode(State.Running, [session, session2]), true);

		session.configuration.noDebug = true;
		assert.strictEqual(isStatusbarInDebugMode(State.Running, [session]), false);
		assert.strictEqual(isStatusbarInDebugMode(State.Running, [session, session2]), false);
	});
});
