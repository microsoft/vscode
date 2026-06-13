/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { HoverService } from '../../browser/hoverService.js';
import { IHoverService } from '../../browser/hover.js';
import { HoverWidget } from '../../browser/hoverWidget.js';
import { IContextMenuService } from '../../../contextview/browser/contextView.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IAccessibilityService } from '../../../accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../accessibility/test/common/testAccessibilityService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { NoMatchingKb } from '../../../keybinding/common/keybindingResolver.js';
import { IMarkdownRendererService } from '../../../markdown/browser/markdownRenderer.js';
import type { IHoverWidget } from '../../../../base/browser/ui/hover/hover.js';

suite('HoverWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let hoverService: HoverService;
	let fixture: HTMLElement;
	let instantiationService: TestInstantiationService;

	setup(() => {
		fixture = document.createElement('div');
		mainWindow.document.body.appendChild(fixture);
		store.add(toDisposable(() => fixture.remove()));

		instantiationService = store.add(new TestInstantiationService());

		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('workbench.hover.delay', 0);
		instantiationService.stub(IConfigurationService, configurationService);

		instantiationService.stub(IContextMenuService, { onDidShowContextMenu: Event.None });

		instantiationService.stub(IKeybindingService, {
			mightProducePrintableCharacter() { return false; },
			softDispatch() { return NoMatchingKb; },
			resolveKeyboardEvent() {
				return {
					getLabel() { return ''; },
					getAriaLabel() { return ''; },
					getElectronAccelerator() { return null; },
					getUserSettingsLabel() { return null; },
					isWYSIWYG() { return false; },
					hasMultipleChords() { return false; },
					getDispatchChords() { return [null]; },
					getSingleModifierDispatchChords() { return []; },
					getChords() { return []; }
				};
			}
		});

		instantiationService.stub(ILayoutService, {
			activeContainer: fixture,
			mainContainer: fixture,
			getContainer() { return fixture; },
			onDidLayoutContainer: Event.None
		});

		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());

		instantiationService.stub(IMarkdownRendererService, {
			render() { return { element: document.createElement('div'), dispose() { } }; },
			setDefaultCodeBlockRenderer() { }
		});

		hoverService = store.add(instantiationService.createInstance(HoverService));
		instantiationService.stub(IHoverService, hoverService);
	});

	function createTarget(): HTMLElement {
		const target = document.createElement('div');
		target.style.width = '100px';
		target.style.height = '100px';
		fixture.appendChild(target);
		return target;
	}

	// A history-item hover (SCM Commit Graph) passes an HTMLElement whose content
	// (long commit message + many co-authors) can far exceed the viewport.
	function createTallContent(): HTMLElement {
		const el = document.createElement('div');
		el.style.width = '300px';
		el.style.height = '4000px';
		el.textContent = 'Tall hover content';
		return el;
	}

	test('overflowing HTMLElement content is bounded so the scrollbar can show (microsoft/vscode#scm-graph-hover-scroll)', () => {
		const hover = hoverService.showInstantHover({
			content: createTallContent(),
			target: createTarget()
		}) as IHoverWidget;
		assert.ok(hover, 'Hover should be created');
		store.add(toDisposable(() => (hover as HoverWidget).dispose()));

		const containerDomNode = (hover as HoverWidget).domNode;
		const scrollableElement = containerDomNode.querySelector<HTMLElement>('.monaco-scrollable-element');
		const contentsDomNode = containerDomNode.querySelector<HTMLElement>('.monaco-hover-content');

		assert.ok(scrollableElement, 'Scrollable element should exist');
		assert.ok(contentsDomNode, 'Contents node should exist');

		const containerMaxHeight = containerDomNode.style.maxHeight;
		assert.notStrictEqual(containerMaxHeight, '', 'Outer container should be height-capped');

		// Regression: the scroll viewport is the DomScrollableElement around
		// contentsDomNode. If only the outer container is capped it just clips
		// (overflow: hidden) and no scrollbar appears. The scrollable root and
		// the contents node must be capped too (parity with editor ContentHoverWidget).
		assert.strictEqual(
			scrollableElement!.style.maxHeight,
			containerMaxHeight,
			'Scrollable element must share the container max-height so the scrollbar can render'
		);
		assert.strictEqual(
			contentsDomNode!.style.maxHeight,
			containerMaxHeight,
			'Contents node must share the container max-height so the scrollbar can render'
		);
	});
});
