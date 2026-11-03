/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, Dimension, getActiveElement, getWindow } from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { OS } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SearchEditor } from '../../../../../workbench/contrib/searchEditor/browser/searchEditor.js';
import { getOrMakeSearchEditorInput } from '../../../../../workbench/contrib/searchEditor/browser/searchEditorInput.js';
import { IReplaceService } from '../../../../../workbench/contrib/search/browser/replace.js';
import { INotebookSearchService } from '../../../../../workbench/contrib/search/common/notebookSearch.js';
import { INotebookEditorService } from '../../../../../workbench/contrib/notebook/browser/services/notebookEditorService.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import '../../../../browser/parts/media/editorPart.css';
import { SearchEditorScheme } from '../../../../../workbench/contrib/searchEditor/browser/constants.js';
import { RUN_EMPTY_SEARCH_COMMAND_ID, SearchEditorEmptyStateContribution } from '../../browser/searchEditorEmptyState.contribution.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../../common/sessionCommands.js';

suite('Sessions - Search editor empty state', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor() {
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = '600px';
		container.style.height = '300px';
		container.style.setProperty('--vscode-spacing-size200', '20px');
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const editor = store.add(instantiationService.createInstance(CodeEditorWidget, container, {
			dimension: { width: 600, height: 300 },
			minimap: { enabled: false },
		}, {
			contributions: EditorExtensionsRegistry.getEditorContributions().filter(contribution => contribution.id === SearchEditorEmptyStateContribution.ID),
		}));
		editor.getContribution(SearchEditorEmptyStateContribution.ID);
		return { editor, container };
	}

	function searchModel(text = '') {
		return store.add(createTextModel(text, null, undefined, URI.from({ scheme: SearchEditorScheme, fragment: 'test' })));
	}

	test('shows quiet action rows without a repeated heading or taking focus', () => {
		const { editor, container } = createEditor();
		const input = append(container, $('input'));
		input.focus();
		editor.setModel(searchModel());
		const emptyState = container.querySelector('.sessions-search-empty-state');
		assert.ok(emptyState);
		assert.deepStrictEqual({
			title: emptyState.querySelector('h2')?.textContent,
			description: emptyState.querySelector('.sessions-empty-state-description')?.textContent,
			actions: [...emptyState.querySelectorAll('.sessions-add-tab-watermark-entry')].map(row => ({
				label: row.textContent,
				role: row.getAttribute('role'),
			})),
			focusPreserved: getActiveElement() === input,
		}, {
			title: undefined,
			description: undefined,
			actions: [{ label: 'Run Search', role: 'button' }, { label: 'Open Files', role: 'button' }],
			focusPreserved: true,
		});
	});

	test('tracks results and restores the empty state when content is cleared', () => {
		const { editor, container } = createEditor();
		const model = searchModel();
		const states: boolean[] = [];
		editor.setModel(model);
		for (const text of ['', '1 result - 1 file\n\napp.ts:\n  1: hello', 'No Results\n', '']) {
			model.setValue(text);
			states.push(!!container.querySelector('.sessions-search-empty-state'));
		}
		assert.deepStrictEqual(states, [true, false, false, true]);
	});

	test('handles restored results, model replacement, and clearing the editor', () => {
		const { editor, container } = createEditor();
		const restored = searchModel('1 result - 1 file\n\napp.ts:\n  1: hello');
		const empty = searchModel();
		const states: boolean[] = [];
		for (const model of [restored, empty, null, empty, restored]) {
			editor.setModel(model);
			states.push(!!container.querySelector('.sessions-search-empty-state'));
		}
		empty.setValue('No Results\n');
		states.push(!!container.querySelector('.sessions-search-empty-state'));
		assert.deepStrictEqual(states, [false, true, false, true, false, false]);
	});

	test('does not show in ordinary empty text editors or without a model', () => {
		const { editor, container } = createEditor();
		const states = [!!container.querySelector('.sessions-search-empty-state')];
		editor.setModel(store.add(createTextModel('', null, undefined, URI.file('/test.txt'))));
		states.push(!!container.querySelector('.sessions-search-empty-state'));
		assert.deepStrictEqual(states, [false, false]);
	});

	test('centers the action rows in the results editor and follows layout changes', () => {
		const { editor, container } = createEditor();
		editor.setModel(searchModel());
		const dimensions = [];
		for (const size of [{ width: 600, height: 300 }, { width: 240, height: 400 }]) {
			editor.layout(size);
			const overlay = container.querySelector<HTMLElement>('.sessions-search-empty-state');
			const content = overlay?.querySelector<HTMLElement>('.sessions-empty-state-content');
			assert.ok(overlay && content);
			// Exercise subpixel flex centering independently of the platform's font metrics.
			content.style.width = `${size.width / 2 + 1 / 64}px`;
			const overlayRect = overlay.getBoundingClientRect();
			const contentRect = content.getBoundingClientRect();
			// Compare centers at CSS-pixel precision to allow fractional layout rounding.
			dimensions.push({
				width: overlayRect.width,
				height: overlayRect.height,
				horizontalOffset: Math.round(Math.abs((contentRect.left + contentRect.right - overlayRect.left - overlayRect.right) / 2)),
				verticalOffset: Math.round(Math.abs((contentRect.top + contentRect.bottom - overlayRect.top - overlayRect.bottom) / 2)),
				pointerEvents: getWindow(overlay).getComputedStyle(overlay).pointerEvents,
			});
		}
		assert.deepStrictEqual(dimensions, [
			{ width: 600, height: 300, horizontalOffset: 0, verticalOffset: 0, pointerEvents: 'none' },
			{ width: 240, height: 400, horizontalOffset: 0, verticalOffset: 0, pointerEvents: 'none' },
		]);
	});

	test('removes the overlay and listeners when the contribution is disposed', () => {
		const { editor, container } = createEditor();
		const model = searchModel();
		editor.setModel(model);
		const contribution = editor.getContribution(SearchEditorEmptyStateContribution.ID);
		assert.ok(contribution);
		contribution.dispose();
		model.setValue('result');
		model.setValue('');
		editor.layout({ width: 240, height: 400 });
		assert.strictEqual(container.querySelector('.sessions-search-empty-state'), null);
	});

	test('centers blank Search controls without minimap overlap and restores the results layout', async () => {
		const configurationService = new TestConfigurationService({
			editor: { minimap: { enabled: true } },
			search: { searchOnType: false, searchEditor: { defaultNumberOfContextLines: 1 } },
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, store);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		instantiationService.stub(IKeybindingService, new class extends MockKeybindingService {
			override lookupKeybinding(commandId: string) {
				const keyCode = commandId === RUN_EMPTY_SEARCH_COMMAND_ID ? KeyCode.KeyR : commandId === NEW_FILE_TAB_COMMAND_ID ? KeyCode.KeyE : undefined;
				const keybinding = keyCode === undefined ? null : decodeKeybinding(KeyMod.CtrlCmd | KeyMod.Shift | keyCode, OS);
				return keybinding ? USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS)[0] : undefined;
			}
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		instantiationService.stub(IReplaceService, new class extends mock<IReplaceService>() { }());
		instantiationService.stub(INotebookSearchService, new class extends mock<INotebookSearchService>() { }());
		instantiationService.stub(INotebookEditorService, new class extends mock<INotebookEditorService>() {
			override onDidAddNotebookEditor = Event.None;
		}());
		instantiationService.stub(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.dock-detail-panel'));
		root.style.cssText = '--vscode-spacing-size240: 24px; --vscode-spacing-size160: 16px; --vscode-spacing-size280: 28px; --vscode-spacing-size80: 8px;';
		store.add(toDisposable(() => root.remove()));
		const host = append(root, $('.part.editor'));
		const pane = store.add(instantiationService.createInstance(SearchEditor, new TestEditorGroupView(1)));
		pane.create(host);
		const input = store.add(instantiationService.invokeFunction(getOrMakeSearchEditorInput, {
			from: 'rawData',
			resultsContents: '',
			config: { query: '' },
			modelUri: URI.from({ scheme: SearchEditorScheme, fragment: 'centered-search-test' }),
		}));
		await pane.setInput(input, { preserveFocus: true }, { newInGroup: true }, CancellationToken.None);
		pane.getControl().getContribution(SearchEditorEmptyStateContribution.ID);
		pane.layout(new Dimension(600, 400));
		const container = host.querySelector<HTMLElement>('.search-editor');
		const query = host.querySelector<HTMLElement>('.query-container');
		assert.ok(container && query);
		const model = pane.getControl().getModel();
		const minimap = container.querySelector<HTMLElement>('.search-results .minimap');
		const field = query.querySelector<HTMLElement>('.monaco-findInput .input');
		const inputBox = field?.closest<HTMLElement>('.monaco-inputbox');
		assert.ok(model && minimap && field && inputBox);
		const advancedControls = [...query.querySelectorAll<HTMLElement>('.search-widget > .search-container > .monaco-findInput > .controls, .search-widget > .search-container > .context-lines-input, .search-widget > .search-container > .monaco-custom-toggle, :scope > .includes-excludes')];
		const chips = [...container.querySelectorAll<HTMLElement>('.sessions-search-empty-state .monaco-keybinding-key')];
		const firstButton = container.querySelector<HTMLElement>('.sessions-search-empty-state .sessions-add-tab-watermark-entry');
		assert.ok(firstButton);
		const panelBounds = container.getBoundingClientRect();
		const firstButtonTop = firstButton.getBoundingClientRect().top;
		assert.deepStrictEqual({
			minimapConfigured: pane.getControl().getLayoutInfo().minimap.minimapWidth > 0,
			shortcutCount: chips.length,
			advancedControlCount: advancedControls.length,
			firstButtonAligned: Math.abs(firstButtonTop - (panelBounds.top + panelBounds.bottom) / 2 + 42) < 1,
			searchAboveButtons: query.getBoundingClientRect().bottom < firstButtonTop,
			shortcutsUnobstructed: chips.every(chip => {
				const bounds = chip.getBoundingClientRect();
				return mainWindow.document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.closest('.sessions-add-tab-watermark-entry') === chip.closest('.sessions-add-tab-watermark-entry');
			}),
		}, {
			minimapConfigured: true,
			shortcutCount: 6,
			advancedControlCount: 4,
			firstButtonAligned: true,
			searchAboveButtons: true,
			shortcutsUnobstructed: true,
		});
		const states = [];
		for (const text of ['', '1 result - 1 file\n\napp.ts:\n  1: hello', 'No Results\n', '']) {
			model.setValue(text);
			const tab = new mainWindow.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
			field.dispatchEvent(tab);
			states.push({
				centered: container.classList.contains('search-editor-empty'),
				queryBelowHeader: query.getBoundingClientRect().top > container.getBoundingClientRect().top + 40,
				queryConstrained: query.clientWidth <= 320,
				actionRows: container.querySelectorAll('.sessions-add-tab-watermark-entry').length,
				minimapVisible: getWindow(minimap).getComputedStyle(minimap).visibility === 'visible',
				visibleAdvancedControls: advancedControls.filter(control => control.getClientRects().length > 0).length,
				inputUsesFullWidth: Math.abs(field.getBoundingClientRect().width - inputBox.clientWidth) < 1,
				tabDefaultPrevented: tab.defaultPrevented,
				resultsTabIndex: pane.getControl().getOption(EditorOption.tabIndex),
			});
		}
		assert.deepStrictEqual(states, [
			{ centered: true, queryBelowHeader: true, queryConstrained: true, actionRows: 2, minimapVisible: false, visibleAdvancedControls: 0, inputUsesFullWidth: true, tabDefaultPrevented: false, resultsTabIndex: -1 },
			{ centered: false, queryBelowHeader: false, queryConstrained: false, actionRows: 0, minimapVisible: true, visibleAdvancedControls: 4, inputUsesFullWidth: false, tabDefaultPrevented: true, resultsTabIndex: 0 },
			{ centered: false, queryBelowHeader: false, queryConstrained: false, actionRows: 0, minimapVisible: true, visibleAdvancedControls: 4, inputUsesFullWidth: false, tabDefaultPrevented: true, resultsTabIndex: 0 },
			{ centered: true, queryBelowHeader: true, queryConstrained: true, actionRows: 2, minimapVisible: false, visibleAdvancedControls: 0, inputUsesFullWidth: true, tabDefaultPrevented: false, resultsTabIndex: -1 },
		]);
		pane.layout(new Dimension(240, 400));
		const queryInput = container.querySelector<HTMLElement>('.search-widget .monaco-findInput');
		const overviewRuler = container.querySelector<HTMLElement>('.decorationsOverviewRuler');
		assert.ok(queryInput && overviewRuler);
		assert.deepStrictEqual({
			readableQuery: queryInput.getBoundingClientRect().width >= 150,
			searchBarFillsControl: Math.abs(queryInput.getBoundingClientRect().width - query.getBoundingClientRect().width) < 1,
			controlsFit: query.getBoundingClientRect().right <= container.getBoundingClientRect().right,
			overviewRulerHidden: getWindow(overviewRuler).getComputedStyle(overviewRuler).visibility === 'hidden',
		}, {
			readableQuery: true,
			searchBarFillsControl: true,
			controlsFit: true,
			overviewRulerHidden: true,
		});

		model.setValue('1 result - 1 file\n\napp.ts:\n  1: hello');
		const resultsContainer = container.querySelector<HTMLElement>('.search-results');
		const detailsToggle = query.querySelector<HTMLElement>('.includes-excludes > .expand');
		assert.ok(resultsContainer && detailsToggle);
		// Keep the browser runner's quirks mode from stretching single-line inputs to the pane height.
		for (const input of query.querySelectorAll<HTMLInputElement>('.file-types input')) {
			input.style.height = 'auto';
		}
		const populatedLayouts = [];
		for (const agentsWindow of [true, false]) {
			root.classList.toggle('agent-sessions-workbench', agentsWindow);
			root.classList.toggle('dock-detail-panel', agentsWindow);
			pane.layout(new Dimension(600, 400));
			const tallHeight = pane.getControl().getLayoutInfo().height;
			pane.layout(new Dimension(600, 200));
			const shortHeight = pane.getControl().getLayoutInfo().height;
			const resizedBottom = resultsContainer.getBoundingClientRect().bottom;
			detailsToggle.click();
			const expandedHeight = pane.getControl().getLayoutInfo().height;
			const expandedBottom = resultsContainer.getBoundingClientRect().bottom;
			populatedLayouts.push({
				agentsWindow,
				shrinksWithPane: shortHeight < tallHeight,
				shrinksForDetails: expandedHeight < shortHeight,
				resizedResultsFit: resizedBottom <= container.getBoundingClientRect().bottom + 1,
				expandedResultsFit: expandedBottom <= container.getBoundingClientRect().bottom + 1,
				editorMatchesAvailableHeight: expandedHeight === resultsContainer.clientHeight,
			});
			detailsToggle.click();
		}
		assert.deepStrictEqual(populatedLayouts, [true, false].map(agentsWindow => ({
			agentsWindow,
			shrinksWithPane: true,
			shrinksForDetails: true,
			resizedResultsFit: true,
			expandedResultsFit: true,
			editorMatchesAvailableHeight: true,
		})));
	});
});
