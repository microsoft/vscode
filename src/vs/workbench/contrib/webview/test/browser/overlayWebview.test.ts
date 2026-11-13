/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { cloneGlobalStylesheets, createStyleSheet } from '../../../../../base/browser/domStylesheets.js';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { OverlayWebview } from '../../browser/overlayWebview.js';
import { IWebviewService } from '../../browser/webview.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { ISizeService } from '../../../../../platform/theme/common/sizeService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import '../../../../browser/media/style.css';
import '../../../../browser/media/floatingPanels.css';
import '../../../../contrib/modernUI/browser/media/editorBorder.css';
import { registerTestIframe } from '../../../../../base/test/browser/testWindow.js';

suite('OverlayWebview', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createOverlay(root: HTMLElement, onDidChangeSizes = Event.None): OverlayWebview {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchLayoutService, { getContainer: () => root });
		instantiationService.stub(IWebviewService, {});
		instantiationService.stub(IContextKeyService, {});
		instantiationService.stub(ISizeService, { onDidChangeSizes });
		instantiationService.stub(IThemeService, { onDidColorThemeChange: Event.None });
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
		part.className = 'part editor floating-editor-outer-left floating-editor-outer-right floating-editor-outer-top floating-editor-outer-bottom';
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
				topLeft: ['0px', '0px'],
				topRight: ['0px', '0px'],
				bottomLeft: ['11px', '0px'],
				bottomRight: ['0px', '11px'],
			},
			zoomedOut: {
				topLeft: ['0px', '0px'],
				topRight: ['0px', '0px'],
				bottomLeft: ['27px', '0px'],
				bottomRight: ['0px', '27px'],
			},
			movedEdges: { left: false, right: true, top: false, bottom: true },
		});
	});

	test('webview content follows exposed component corners rather than rounding title and split seams', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench agent-sessions-workbench';
		const part = root.appendChild(document.createElement('div'));
		part.className = 'part editor';
		part.style.cssText = 'position: relative; width: 400px; height: 400px; border: 1px solid transparent; border-radius: 6px 0 0 6px; box-sizing: border-box;';
		const anchor = part.appendChild(document.createElement('div'));
		anchor.style.cssText = 'position: absolute; top: 30px; bottom: 0; left: 0; right: 0;';
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		const changes = store.add(new Emitter<void>());
		const overlay = createOverlay(root, changes.event);
		overlay.setAnchorElement(anchor);
		const initial = getWindow(root).getComputedStyle(overlay.container).borderRadius;
		part.style.borderRadius = '3px';
		changes.fire();
		const updated = getWindow(root).getComputedStyle(overlay.container).borderRadius;
		anchor.style.right = '50%';
		overlay.setAnchorElement(anchor);
		const split = getWindow(root).getComputedStyle(overlay.container).borderRadius;
		assert.deepStrictEqual({ initial, updated, split }, {
			initial: '0px 0px 0px 5px',
			updated: '0px 0px 2px 2px',
			split: '0px 0px 0px 2px',
		});
	});

	test('auxiliary webview clipping refreshes after cloned theme styles propagate', async () => {
		const sheet = createStyleSheet(undefined, undefined, store.add(new DisposableStore()));
		sheet.textContent = '.aux-overlay-test .part { border-radius: 8px; }';
		const frame = append(document.body, $<HTMLIFrameElement>('iframe'));
		store.add(toDisposable(() => frame.remove()));
		store.add(registerTestIframe(frame));
		const target = frame.contentWindow!;
		store.add(cloneGlobalStylesheets(target));
		const root = $('.monaco-workbench.agent-sessions-workbench.aux-overlay-test');
		target.document.body.appendChild(root);
		const part = append(root, $('.part.editor'));
		part.style.cssText = 'position: relative; width: 200px; height: 200px; border: 1px solid transparent;';
		const anchor = append(part, $('div'));
		anchor.style.cssText = 'position: absolute; inset: 0;';
		const changes = store.add(new Emitter<void>());
		const overlay = createOverlay(root, changes.event);
		overlay.setAnchorElement(anchor);
		const radii = [overlay.container.style.borderRadius];
		for (const radius of [0, 3]) {
			sheet.textContent = `.aux-overlay-test .part { border-radius: ${radius}px; }`;
			changes.fire();
			await new Promise<void>(resolve => target.requestAnimationFrame(() => resolve()));
			radii.push(overlay.container.style.borderRadius);
		}
		assert.deepStrictEqual(radii, ['7px', '0px', '2px']);
	});
});
