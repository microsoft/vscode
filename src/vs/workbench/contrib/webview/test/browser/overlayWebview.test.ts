/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { OverlayWebview } from '../../browser/overlayWebview.js';
import { IWebviewService } from '../../browser/webview.js';
import '../../../../browser/media/style.css';
import '../../../../browser/media/floatingPanels.css';

suite('OverlayWebview', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createOverlay(root: HTMLElement): OverlayWebview {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchLayoutService, { getContainer: () => root });
		instantiationService.stub(IWebviewService, {});
		instantiationService.stub(IContextKeyService, {});
		return store.add(instantiationService.createInstance(OverlayWebview, {
			title: undefined,
			options: {},
			contentOptions: {},
			extension: undefined,
		}));
	}

	function getOuterEdges(element: HTMLElement): { left: boolean; right: boolean; top: boolean; bottom: boolean } {
		return {
			left: element.classList.contains('webview-overlay-outer-left'),
			right: element.classList.contains('webview-overlay-outer-right'),
			top: element.classList.contains('webview-overlay-outer-top'),
			bottom: element.classList.contains('webview-overlay-outer-bottom'),
		};
	}

	test('keeps overlay classes synchronized with the current anchor part', async () => {
		const root = document.createElement('div');
		const firstPart = document.createElement('div');
		firstPart.className = 'part floating-editor-outer-left floating-editor-outer-top';
		const firstAnchor = document.createElement('div');
		firstPart.appendChild(firstAnchor);
		root.appendChild(firstPart);

		const secondPart = document.createElement('div');
		secondPart.className = 'part floating-part-outer-left floating-part-outer-bottom';
		const secondAnchor = document.createElement('div');
		secondPart.appendChild(secondAnchor);
		root.appendChild(secondPart);

		const modalPart = document.createElement('div');
		modalPart.className = 'part modal-editor-part';
		const modalAnchor = document.createElement('div');
		modalPart.appendChild(modalAnchor);
		root.appendChild(modalPart);

		const overlay = createOverlay(root);

		overlay.setAnchorElement(firstAnchor);
		const initialEdges = getOuterEdges(overlay.container);

		firstPart.className = 'part floating-editor-outer-right floating-editor-outer-bottom';
		await timeout(0);
		const updatedFirstEdges = getOuterEdges(overlay.container);

		overlay.setAnchorElement(secondAnchor);
		const reanchoredEdges = getOuterEdges(overlay.container);

		firstPart.className = 'part floating-editor-outer-right floating-editor-outer-top';
		await timeout(0);
		const afterOldPartChanged = getOuterEdges(overlay.container);

		secondPart.className = 'part floating-part-outer-right floating-part-outer-top';
		await timeout(0);
		const updatedSecondEdges = getOuterEdges(overlay.container);

		overlay.setAnchorElement(modalAnchor);
		const modalOverlay = {
			outerEdges: getOuterEdges(overlay.container),
			modal: overlay.container.classList.contains('webview-overlay-modal'),
		};

		overlay.setAnchorElement(firstAnchor);

		assert.deepStrictEqual({
			initialEdges,
			updatedFirstEdges,
			reanchoredEdges,
			afterOldPartChanged,
			updatedSecondEdges,
			modalOverlay,
			modalRemovedAfterReanchor: !overlay.container.classList.contains('webview-overlay-modal'),
		}, {
			initialEdges: { left: true, right: false, top: true, bottom: false },
			updatedFirstEdges: { left: false, right: true, top: false, bottom: true },
			reanchoredEdges: { left: true, right: false, top: false, bottom: true },
			afterOldPartChanged: { left: true, right: false, top: false, bottom: true },
			updatedSecondEdges: { left: false, right: true, top: true, bottom: false },
			modalOverlay: {
				outerEdges: { left: false, right: false, top: false, bottom: false },
				modal: true,
			},
			modalRemovedAfterReanchor: true,
		});
	});

	test('rounds only webview anchors that reach a native corner across editor splits and moves', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui floating-panels mac macos-tahoe nostatusbar';
		root.style.cssText = '--vscode-cornerRadius-large: 8px; --vscode-spacing-size40: 4px; --vscode-strokeThickness: 1px; --window-zoom-factor: 1;';
		const part = root.appendChild(document.createElement('div'));
		part.className = 'part floating-editor-outer-left floating-editor-outer-right floating-editor-outer-top floating-editor-outer-bottom';
		part.style.cssText = 'position: relative; width: 400px; height: 400px; border: 1px solid transparent; box-sizing: border-box;';
		const anchors = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map((name, index) => {
			const anchor = part.appendChild(document.createElement('div'));
			anchor.style.cssText = `position: absolute; left: ${index % 2 * 50}%; top: ${Math.floor(index / 2) * 50}%; width: 50%; height: 50%;`;
			return { name, anchor };
		});
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		const overlay = createOverlay(root);
		const corners = () => Object.fromEntries(anchors.map(({ name, anchor }) => {
			overlay.setAnchorElement(anchor);
			const style = getWindow(root).getComputedStyle(overlay.container);
			return [name, [style.borderBottomLeftRadius, style.borderBottomRightRadius]];
		}));
		const defaultZoom = corners();
		root.style.setProperty('--window-zoom-factor', '0.5');
		const zoomedOut = corners();

		const movedAnchor = anchors[1].anchor;
		overlay.setAnchorElement(movedAnchor);
		movedAnchor.style.top = '50%';
		overlay.setAnchorElement(movedAnchor);

		assert.deepStrictEqual({ defaultZoom, zoomedOut, movedEdges: getOuterEdges(overlay.container) }, {
			defaultZoom: {
				topLeft: ['8px', '8px'],
				topRight: ['8px', '8px'],
				bottomLeft: ['11px', '8px'],
				bottomRight: ['8px', '11px'],
			},
			zoomedOut: {
				topLeft: ['8px', '8px'],
				topRight: ['8px', '8px'],
				bottomLeft: ['27px', '8px'],
				bottomRight: ['8px', '27px'],
			},
			movedEdges: { left: false, right: true, top: false, bottom: true },
		});
	});
});
