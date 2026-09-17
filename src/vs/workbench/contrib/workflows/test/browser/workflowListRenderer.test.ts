/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { WorkflowListRenderer } from '../../browser/workflowListRenderer.js';
import '../../browser/media/workflows.css';

suite('Workflow list renderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('two-line rows reset inherited line height and update labels without replacing their targets', () => {
		const container = dom.append(mainWindow.document.body, dom.$('.monaco-workflow-catalog'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = '400px';
		container.style.height = '52px';
		container.style.lineHeight = '52px';
		const changes = store.add(new Emitter<void>());
		let label = 'Original';
		const renderer = new WorkflowListRenderer(NullHoverService);
		const template = renderer.renderTemplate(container);
		store.add(toDisposable(() => renderer.disposeTemplate(template)));
		renderer.renderElement({ id: 'checkpoint', get label() { return label; }, description: 'Workspace', onDidChange: changes.event }, 0, template);
		const labelNode = template.label;
		label = 'Updated';
		changes.fire();
		assert.deepStrictEqual({
			label: template.label.textContent,
			ariaLabel: container.getAttribute('aria-label'),
			sameTarget: labelNode === container.firstElementChild?.firstElementChild,
			lineHeight: mainWindow.getComputedStyle(labelNode).lineHeight,
			visible: labelNode.getBoundingClientRect().height > 0,
		}, { label: 'Updated', ariaLabel: 'Updated', sameTarget: true, lineHeight: 'normal', visible: true });
	});
});
