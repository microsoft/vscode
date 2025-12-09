/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-syntax */

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { renderViewTree } from '../../browser/baseDebugView.js';
import { DebugExpressionRenderer } from '../../browser/debugExpressionRenderer.js';
import { isStatusbarInDebugMode } from '../../browser/statusbarColorProvider.js';
import { State } from '../../common/debug.js';
import { Expression, Scope, StackFrame, Thread, Variable } from '../../common/debugModel.js';
import { MockSession } from '../common/mockDebug.js';
import { createTestSession } from './callStack.test.js';
import { createMockDebugModel } from './mockDebugModel.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
const $ = dom.$;


suite('Debug - Base Debug View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let renderer: DebugExpressionRenderer;
	let configurationService: TestConfigurationService;

	function assertVariable(session: MockSession, scope: Scope, disposables: Pick<DisposableStore, 'add'>, displayType: boolean) {
		let variable = new Variable(session, 1, scope, 2, 'foo', 'bar.foo', undefined, 0, 0, undefined, {}, 'string');
		let expression = $('.');
		let name = $('.');
		let type = $('.');
		let value = $('.');
		const label = new HighlightedLabel(name);
		const lazyButton = $('.');
		const store = disposables.add(new DisposableStore());
		store.add(renderer.renderVariable({ expression, name, type, value, label, lazyButton }, variable, { showChanged: false }));

		assert.strictEqual(label.element.textContent, 'foo');
		assert.strictEqual(value.textContent, '');

		variable.value = 'hey';
		expression = $('.');
		name = $('.');
		type = $('.');
		value = $('.');
		store.add(renderer.renderVariable({ expression, name, type, value, label, lazyButton }, variable, { showChanged: false }));
		assert.strictEqual(value.textContent, 'hey');
		assert.strictEqual(label.element.textContent, displayType ? 'foo: ' : 'foo =');
		assert.strictEqual(type.textContent, displayType ? 'string =' : '');

		variable.value = isWindows ? 'C:\\foo.js:5' : '/foo.js:5';
		expression = $('.');
		name = $('.');
		type = $('.');
		value = $('.');
		store.add(renderer.renderVariable({ expression, name, type, value, label, lazyButton }, variable, { showChanged: false }));
		assert.ok(value.querySelector('a'));
		assert.strictEqual(value.querySelector('a')!.textContent, variable.value);

		variable = new Variable(session, 1, scope, 2, 'console', 'console', '5', 0, 0, undefined, { kind: 'virtual' });
		expression = $('.');
		name = $('.');
		type = $('.');
		value = $('.');
		store.add(renderer.renderVariable({ expression, name, type, value, label, lazyButton }, variable, { showChanged: false }));
		assert.strictEqual(name.className, 'virtual');
		assert.strictEqual(label.element.textContent, 'console =');
		assert.strictEqual(value.className, 'value number');

		variable = new Variable(session, 1, scope, 2, 'xpto', 'xpto.xpto', undefined, 0, 0, undefined, {}, 'custom-type');
		store.add(renderer.renderVariable({ expression, name, type, value, label, lazyButton }, variable, { showChanged: false }));
		assert.strictEqual(label.element.textContent, 'xpto');
		assert.strictEqual(value.textContent, '');
		variable.value = '2';
		expression = $('.');
		name = $('.');
		type = $('.');
		value = $('.');
		store.add(renderer.renderVariable({ expression, name, type, value, label, lazyButton }, variable, { showChanged: false }));
		assert.strictEqual(value.textContent, '2');
		assert.strictEqual(label.element.textContent, displayType ? 'xpto: ' : 'xpto =');
		assert.strictEqual(type.textContent, displayType ? 'custom-type =' : '');

		label.dispose();
	}

	/**
	 * Instantiate services for use by the functions being tested.
	 */
	setup(() => {
		const instantiationService: TestInstantiationService = workbenchInstantiationService(undefined, disposables);
		configurationService = instantiationService.createInstance(TestConfigurationService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IHoverService, NullHoverService);
		renderer = instantiationService.createInstance(DebugExpressionRenderer);
	});

	test('render view tree', () => {
		const container = $('.container');
		const treeContainer = renderViewTree(container);

		assert.strictEqual(treeContainer.className, 'debug-view-content file-icon-themable-tree');
		assert.strictEqual(container.childElementCount, 1);
		assert.strictEqual(container.firstChild, treeContainer);
		assert.strictEqual(dom.isHTMLDivElement(treeContainer), true);
	});

	test('render expression value', () => {
		let container = $('.container');
		const store = disposables.add(new DisposableStore());
		store.add(renderer.renderValue(container, 'render \n me', {}));
		assert.strictEqual(container.className, 'container value');
		assert.strictEqual(container.textContent, 'render \n me');

		const expression = new Expression('console');
		expression.value = 'Object';
		container = $('.container');
		store.add(renderer.renderValue(container, expression, { colorize: true }));
		assert.strictEqual(container.className, 'container value unavailable error');

		expression.available = true;
		expression.value = '"string value"';
		container = $('.container');
		store.add(renderer.renderValue(container, expression, { colorize: true }));
		assert.strictEqual(container.className, 'container value string');
		assert.strictEqual(container.textContent, '"string value"');

		expression.type = 'boolean';
		container = $('.container');
		store.add(renderer.renderValue(container, expression, { colorize: true }));
		assert.strictEqual(container.className, 'container value boolean');
		assert.strictEqual(container.textContent, expression.value);

		expression.value = 'this is a long string';
		container = $('.container');
		store.add(renderer.renderValue(container, expression, { colorize: true, maxValueLength: 4 }));
		assert.strictEqual(container.textContent, 'this...');

		expression.value = isWindows ? 'C:\\foo.js:5' : '/foo.js:5';
		container = $('.container');
		store.add(renderer.renderValue(container, expression, { colorize: true }));
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

		configurationService.setUserConfiguration('debug.showVariableTypes', false);
		assertVariable(session, scope, disposables, false);

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

		configurationService.setUserConfiguration('debug.showVariableTypes', true);
		assertVariable(session, scope, disposables, true);
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
