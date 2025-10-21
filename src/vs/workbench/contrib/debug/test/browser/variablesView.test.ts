/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { DebugExpressionRenderer } from '../../browser/debugExpressionRenderer.js';
import { VariablesRenderer } from '../../browser/variablesView.js';
import { IDebugService, IViewModel } from '../../common/debug.js';
import { Scope, StackFrame, Thread, Variable } from '../../common/debugModel.js';
import { MockDebugService, MockSession } from '../common/mockDebug.js';

const $ = dom.$;

function assertVariable(disposables: Pick<DisposableStore, 'add'>, variablesRenderer: VariablesRenderer, displayType: boolean) {
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
	const node = {
		element: new Variable(session, 1, scope, 2, 'foo', 'bar.foo', undefined, 0, 0, undefined, {}, 'string'),
		depth: 0,
		visibleChildrenCount: 1,
		visibleChildIndex: -1,
		collapsible: false,
		collapsed: false,
		visible: true,
		filterData: undefined,
		children: []
	};
	const expression = $('.');
	const name = $('.');
	const type = $('.');
	const value = $('.');
	const label = disposables.add(new HighlightedLabel(name));
	const lazyButton = $('.');
	const inputBoxContainer = $('.');
	const elementDisposable = disposables.add(new DisposableStore());
	const templateDisposable = disposables.add(new DisposableStore());
	const currentElement = undefined;
	const data = {
		expression,
		name,
		type,
		value,
		label,
		lazyButton,
		inputBoxContainer,
		elementDisposable,
		templateDisposable,
		currentElement
	};
	variablesRenderer.renderElement(node, 0, data);
	assert.strictEqual(value.textContent, '');
	assert.strictEqual(label.element.textContent, 'foo');

	node.element.value = 'xpto';
	variablesRenderer.renderElement(node, 0, data);
	assert.strictEqual(value.textContent, 'xpto');
	assert.strictEqual(type.textContent, displayType ? 'string =' : '');
	assert.strictEqual(label.element.textContent, displayType ? 'foo: ' : 'foo =');

	variablesRenderer.disposeTemplate(data);
}

suite('Debug - Variable Debug View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let variablesRenderer: VariablesRenderer;
	let instantiationService: TestInstantiationService;
	let expressionRenderer: DebugExpressionRenderer;
	let configurationService: TestConfigurationService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		configurationService = instantiationService.createInstance(TestConfigurationService);
		instantiationService.stub(IConfigurationService, configurationService);
		expressionRenderer = instantiationService.createInstance(DebugExpressionRenderer);
		const debugService = new MockDebugService();
		instantiationService.stub(IHoverService, NullHoverService);
		debugService.getViewModel = () => <IViewModel>{ focusedStackFrame: undefined, getSelectedExpression: () => undefined };
		debugService.getViewModel().getSelectedExpression = () => undefined;
		instantiationService.stub(IDebugService, debugService);
	});

	test('variable expressions with display type', () => {
		configurationService.setUserConfiguration('debug.showVariableTypes', true);
		instantiationService.stub(IConfigurationService, configurationService);
		variablesRenderer = instantiationService.createInstance(VariablesRenderer, expressionRenderer);
		assertVariable(disposables, variablesRenderer, true);
	});

	test('variable expressions', () => {
		configurationService.setUserConfiguration('debug.showVariableTypes', false);
		instantiationService.stub(IConfigurationService, configurationService);
		variablesRenderer = instantiationService.createInstance(VariablesRenderer, expressionRenderer);
		assertVariable(disposables, variablesRenderer, false);
	});
});
