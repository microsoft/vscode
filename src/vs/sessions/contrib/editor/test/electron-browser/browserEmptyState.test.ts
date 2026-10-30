/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { OS } from '../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId, IBrowserViewNavigationEvent } from '../../../../../platform/browserView/common/browserView.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IBrowserViewModel } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { BrowserEditor, BrowserWidgetLocation } from '../../../../../workbench/contrib/browserView/electron-browser/browserEditor.js';
import '../../../../../workbench/contrib/browserView/electron-browser/media/browser.css';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SessionsBrowserEmptyState } from '../../electron-browser/browserEmptyState.contribution.js';

suite('Sessions - Browser empty state', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('centers controls only for blank pages and removes model listeners on detach', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const onDidChangeModel = store.add(new Emitter<{ model: IBrowserViewModel | undefined; isNew: boolean }>());
		const onDidNavigate = store.add(new Emitter<IBrowserViewNavigationEvent>());
		const onWillNavigate = store.add(new Emitter<string>());
		const navigate = (url: string) => onDidNavigate.fire({ url, title: '', canGoBack: false, canGoForward: false, certificateError: undefined });
		let layouts = 0;
		const editor = upcastPartial<BrowserEditor>({
			onDidChangeModel: onDidChangeModel.event,
			layoutBrowserContainer: () => { layouts++; },
		});
		const feature = store.add(instantiationService.createInstance(SessionsBrowserEmptyState, editor));
		const root = append(mainWindow.document.body, $('.agent-sessions-workbench.browser-root'));
		store.add(toDisposable(() => root.remove()));
		const container = append(root, $('.browser-container'));
		const widget = feature.widgets[0].element;
		append(container, widget);
		feature.onContainerCreated(container);
		const states: { centered: boolean; actionsHidden: boolean }[] = [];
		const record = () => states.push({ centered: root.classList.contains('sessions-browser-empty'), actionsHidden: widget.hidden === true });
		record();
		feature.prerenderInput(upcastPartial<BrowserEditorInput>({ url: 'https://example.com' }));
		record();
		onDidChangeModel.fire({ model: upcastPartial<IBrowserViewModel>({ url: '', onDidNavigate: onDidNavigate.event, onWillNavigate: onWillNavigate.event }), isNew: true });
		record();
		onWillNavigate.fire('https://example.com');
		const headerRestoredBeforeNavigation = !root.classList.contains('sessions-browser-empty');
		navigate('https://example.com');
		record();
		onDidChangeModel.fire({ model: undefined, isNew: false });
		record();
		navigate('https://stale.example.com');
		record();
		const rows = [...widget.querySelectorAll('.sessions-add-tab-watermark-label')].map(row => row.textContent);
		feature.dispose();
		assert.deepStrictEqual({ states, rows, layouts, headerRestoredBeforeNavigation, centeredAfterDispose: root.classList.contains('sessions-browser-empty') }, {
			states: [
				{ centered: true, actionsHidden: false },
				{ centered: false, actionsHidden: true },
				{ centered: true, actionsHidden: false },
				{ centered: false, actionsHidden: true },
				{ centered: true, actionsHidden: false },
				{ centered: true, actionsHidden: false },
			],
			rows: ['Open Address...', 'History'],
			layouts: 5,
			headerRestoredBeforeNavigation: true,
			centeredAfterDispose: false,
		});
	});

	test('keeps whole action rows outside the inset browser viewport', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		instantiationService.stub(IKeybindingService, new class extends MockKeybindingService {
			override lookupKeybinding(commandId: string) {
				const keyCode = commandId === BrowserViewCommandId.FocusUrlInput ? KeyCode.KeyL : commandId === BrowserViewCommandId.ShowHistory ? KeyCode.KeyY : undefined;
				const keybinding = keyCode === undefined ? null : decodeKeybinding(KeyMod.CtrlCmd | keyCode, OS);
				return keybinding ? USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS)[0] : undefined;
			}
		});
		const onDidChangeModel = store.add(new Emitter<{ model: IBrowserViewModel | undefined; isNew: boolean }>());
		const editor = upcastPartial<BrowserEditor>({
			onDidChangeModel: onDidChangeModel.event,
			layoutBrowserContainer: () => { },
		});
		const feature = store.add(instantiationService.createInstance(SessionsBrowserEmptyState, editor));
		const workbench = append(mainWindow.document.body, $('.agent-sessions-workbench'));
		workbench.style.cssText = '--vscode-spacing-size80: 8px; --vscode-spacing-size160: 16px; --vscode-spacing-size240: 24px; --vscode-spacing-size280: 28px; --vscode-codiconFontSize: 16px;';
		store.add(toDisposable(() => workbench.remove()));
		const root = append(workbench, $('.browser-root'));
		const navbar = append(root, $('.browser-navbar'));
		append(navbar, $('input'));
		const widget = feature.widgets[0];
		assert.strictEqual(widget.location, BrowserWidgetLocation.Toolbar);
		append(root, widget.element);
		const wrapper = append(root, $('.browser-container-wrapper'));
		const container = append(wrapper, $('.browser-container'));
		container.style.cssText = 'width: calc(100% - 6px); height: calc(100% - 6px); left: 3px; top: 3px;';
		const placeholder = append(container, $('.browser-placeholder-contents'));
		feature.onContainerCreated(container);
		const rows = [...widget.element.querySelectorAll<HTMLElement>('.sessions-add-tab-watermark-entry')];
		const keycaps = [...widget.element.querySelectorAll<HTMLElement>('.monaco-keybinding-key')];
		assert.strictEqual(keycaps.length, 4);
		const results = [];
		for (const width of [600, 240]) {
			for (const height of [360, 160]) {
				workbench.style.width = `${width}px`;
				workbench.style.height = `${height}px`;
				feature.onPaneResized();
				const rootBounds = root.getBoundingClientRect();
				const actionBounds = widget.element.getBoundingClientRect();
				const navbarBounds = navbar.getBoundingClientRect();
				results.push({
					width,
					height,
					addressBarAtTop: navbarBounds.top === rootBounds.top,
					fullWidthToolbar: navbarBounds.width === rootBounds.width,
					firstActionAligned: Math.abs(actionBounds.top - (rootBounds.top + rootBounds.bottom) / 2 + 42) < 1,
					outsideViewport: !placeholder.contains(widget.element),
					wholeRowsVisible: rows.every(row => {
						const bounds = row.getBoundingClientRect();
						return bounds.top >= actionBounds.top && bounds.bottom <= actionBounds.bottom
							&& bounds.top >= rootBounds.top && bounds.bottom <= rootBounds.bottom;
					}),
					rowHeights: rows.map(row => row.getBoundingClientRect().height),
					wholeVisibleKeycaps: keycaps.filter(keycap => keycap.getClientRects().length > 0).every(keycap => {
						const bounds = keycap.getBoundingClientRect();
						return bounds.top >= actionBounds.top && bounds.bottom <= actionBounds.bottom;
					}),
					clippedPageHidden: getWindow(wrapper).getComputedStyle(wrapper).visibility === 'hidden',
				});
			}
		}
		feature.prerenderInput(upcastPartial<BrowserEditorInput>({ url: 'https://example.com' }));
		assert.deepStrictEqual({
			results,
			loadedPage: {
				actionsHidden: widget.element.hidden,
				viewportVisible: getWindow(wrapper).getComputedStyle(wrapper).visibility === 'visible',
				viewportPosition: getWindow(wrapper).getComputedStyle(wrapper).position,
				addressBarAtTop: navbar.getBoundingClientRect().top === root.getBoundingClientRect().top,
			},
		}, {
			results: [600, 240].flatMap(width => [360, 160].map(height => ({
				width,
				height,
				addressBarAtTop: true,
				fullWidthToolbar: true,
				firstActionAligned: true,
				outsideViewport: true,
				wholeRowsVisible: true,
				rowHeights: [28, 28],
				wholeVisibleKeycaps: true,
				clippedPageHidden: true,
			}))),
			loadedPage: { actionsHidden: true, viewportVisible: true, viewportPosition: 'relative', addressBarAtTop: true },
		});
	});

	test('focuses a visible action in blank Browser tabs without taking loaded-page focus', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const onDidChangeModel = store.add(new Emitter<{ model: IBrowserViewModel | undefined; isNew: boolean }>());
		const editor = upcastPartial<BrowserEditor>({
			onDidChangeModel: onDidChangeModel.event,
			layoutBrowserContainer: () => { },
		});
		const feature = store.add(instantiationService.createInstance(SessionsBrowserEmptyState, editor));
		const root = append(mainWindow.document.body, $('.agent-sessions-workbench.browser-root'));
		root.style.cssText = 'width: 400px; height: 300px;';
		store.add(toDisposable(() => root.remove()));
		const outside = append(root, $('button', undefined, 'Outside'));
		append(root, feature.widgets[0].element);
		const wrapper = append(root, $('.browser-container-wrapper'));
		const viewport = append(wrapper, $('.browser-container', { tabIndex: 0 }));
		feature.onContainerCreated(viewport);
		outside.focus();
		const blankClaimed = feature.tryFocus();
		const blankFocus = mainWindow.document.activeElement?.closest('.sessions-add-tab-watermark-entry')?.textContent;
		feature.prerenderInput(upcastPartial<BrowserEditorInput>({ url: 'https://example.com' }));
		outside.focus();
		const loadedClaimed = feature.tryFocus();
		assert.deepStrictEqual({
			blankClaimed,
			blankFocus,
			loadedClaimed,
			loadedFocusPreserved: mainWindow.document.activeElement === outside,
		}, {
			blankClaimed: true,
			blankFocus: 'Open Address...',
			loadedClaimed: false,
			loadedFocusPreserved: true,
		});
	});
});
