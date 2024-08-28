/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as dom from 'vs/base/browser/dom';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { WatchExpressionsRenderer } from 'vs/workbench/contrib/debug/browser/watchExpressionsView';
import { Scope, StackFrame, Thread, Variable } from 'vs/workbench/contrib/debug/common/debugModel';
import { MockDebugService, MockSession } from 'vs/workbench/contrib/debug/test/common/mockDebug';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { NullHoverService } from 'vs/platform/hover/test/browser/nullHoverService';
import { IDebugService, IViewModel } from 'vs/workbench/contrib/debug/common/debug';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
const $ = dom.$;

function assertWatchVariable(disposables: Pick<DisposableStore, "add">, watchExpressionsRenderer: WatchExpressionsRenderer, displayType: boolean) {
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
	watchExpressionsRenderer.renderElement(node, 0, data);
	assert.strictEqual(value.textContent, '');
	assert.strictEqual(label.element.textContent, displayType ? 'foo: ' : 'foo =');

	node.element.value = 'xpto';
	watchExpressionsRenderer.renderElement(node, 0, data);
	assert.strictEqual(value.textContent, 'xpto');
	assert.strictEqual(type.textContent, displayType ? 'string =' : '');
	assert.strictEqual(label.element.textContent, displayType ? 'foo: ' : 'foo =');
}

suite('Debug - Watch Debug View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let watchExpressionsRenderer: WatchExpressionsRenderer;
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		const debugService = new MockDebugService();
		instantiationService.stub(IHoverService, NullHoverService);
		debugService.getViewModel = () => <IViewModel>{ focusedStackFrame: undefined, getSelectedExpression: () => undefined };
		debugService.getViewModel().getSelectedExpression = () => undefined;
		instantiationService.stub(IDebugService, debugService);
	});

	test('watch expressions with display type', () => {
		configurationService = new TestConfigurationService({
			debug: {
				showVariableTypes: true
			}
		});
		instantiationService.stub(IConfigurationService, configurationService);
		watchExpressionsRenderer = instantiationService.createInstance(WatchExpressionsRenderer, null as any);
		assertWatchVariable(disposables, watchExpressionsRenderer, true);
	});

	test('watch expressions', () => {
		configurationService = new TestConfigurationService({
			debug: {
				showVariableTypes: false
			}
		});
		instantiationService.stub(IConfigurationService, configurationService);
		watchExpressionsRenderer = instantiationService.createInstance(WatchExpressionsRenderer, null as any);
		assertWatchVariable(disposables, watchExpressionsRenderer, false);
	});
});
