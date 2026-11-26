/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import severity from '../../../../../base/common/severity.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { registerColors } from '../../../terminal/common/terminalColorRegistry.js';
import { DebugExpressionRenderer } from '../../browser/debugExpressionRenderer.js';
import { ReplOutputElementRenderer } from '../../browser/replViewer.js';
import { ReplOutputElement } from '../../common/replModel.js';
import { createTestSession } from './callStack.test.js';
import { createMockDebugModel } from './mockDebugModel.js';

suite('Debug - REPL Viewer', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IConfigurationService, instantiationService.createInstance(TestConfigurationService));
		instantiationService.stub(IHoverService, NullHoverService);
		registerColors();
	});

	function renderOutput(value: string): { rendered: string; value: string } {
		const renderer = instantiationService.createInstance(ReplOutputElementRenderer, instantiationService.createInstance(DebugExpressionRenderer));
		const template = renderer.renderTemplate($('.container'));
		const session = disposables.add(createTestSession(createMockDebugModel(disposables)));
		const element = new ReplOutputElement(session, 'id', value, severity.Info);
		const node: ITreeNode<ReplOutputElement, FuzzyScore> = { element, children: [], depth: 1, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };

		renderer.renderElement(node, 0, template);
		const result = { rendered: template.value.textContent ?? '', value: element.toString() };

		renderer.disposeElement(node, 0, template);
		renderer.disposeTemplate(template);
		return result;
	}

	test('output renderer truncates a huge line but keeps the full value', () => {
		const { rendered, value } = renderOutput('A'.repeat(100_000));

		assert.deepStrictEqual({ rendered: rendered.length, value: value.length }, { rendered: 10_001, value: 100_000 });
	});

	test('output renderer does not cut an ANSI sequence at the truncation point', () => {
		const { rendered } = renderOutput(`${'a'.repeat(9_998)}\x1b[31m${'b'.repeat(10)}\nhello`);

		assert.strictEqual(rendered.slice(9_995), 'aaabb\u2026\nhello');
	});
});
