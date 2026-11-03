/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { DiffEditorViewMode } from '../../../../../editor/common/config/editorOptions.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { IDiffEditorOptionsService, SessionsWordWrap } from '../../../editor/common/diffEditorOptionsService.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';
import { ISessionChangesService } from '../../browser/sessionChangesService.js';
import { IChangesViewService } from '../../common/changesViewService.js';
import '../../../../../editor/browser/widget/multiDiffEditor/style.css';
import '../../browser/media/sessionChangesEditor.css';

suite('SessionChangesEditor empty state layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('centers before resize observers run after initial layout, resizing, and restoring empty content', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionHasGitRepositoryObs = constObservable(false);
		}());
		instantiationService.stub(IAgentWorkbenchLayoutService, {
			agentWorkbenchLayout: AgentWorkbenchLayout.Desktop,
		});
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() { }());
		instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
			override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
		}());
		const loading = observableValue('loading', false);
		const model = new class extends mock<MultiDiffEditorViewModel>() {
			override readonly isLoading = loading;
			override readonly items = constObservable([]);
		}();
		const viewModel = observableValue<MultiDiffEditorViewModel | undefined>('viewModel', model);
		instantiationService.stubInstance(MultiDiffEditorWidget, {
			viewModel,
			onDidChangeActiveControl: Event.None,
			setPaddingBottom() { },
			setVariant() { },
			setDiffLayoutOptions() { },
			layout() { },
			dispose() { },
		});
		const group = append(mainWindow.document.body, $('.editor-group-container'));
		group.style.cssText = 'height: 0; width: 400px; --vscode-spacing-size160: 16px; --vscode-spacing-size240: 24px; --vscode-spacing-size280: 28px;';
		store.add(toDisposable(() => group.remove()));
		const header = append(group, $('div'));
		header.style.height = '35px';
		const parent = append(group, $('.editor-instance'));
		parent.style.height = '365px';
		const editor = store.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		editor.create(parent);
		const container = parent.querySelector<HTMLElement>('.session-changes-editor-empty-state')!;
		const content = container.querySelector<HTMLElement>('.sessions-empty-state-content')!;
		const actions = container.querySelector<HTMLElement>('.changes-empty-state-actions')!;
		const status = container.querySelector<HTMLElement>('.sessions-empty-state-description')!;
		const initialTranslate = content.style.translate;
		const results = [];
		for (const height of [400, 640, 260, 400]) {
			for (const headerHeight of [35, 28]) {
				group.style.height = `${height}px`;
				header.style.height = `${headerHeight}px`;
				parent.style.height = `${height - headerHeight}px`;
				editor.layout(new Dimension(400, height - headerHeight));
				for (const restored of [false, true]) {
					if (restored) {
						loading.set(true, undefined);
						group.style.height = `${height + 100}px`;
						parent.style.height = `${height + 100 - headerHeight}px`;
						loading.set(false, undefined);
					}
					const bounds = group.getBoundingClientRect();
					results.push({
						height, headerHeight, restored,
						visible: !container.hidden,
						aligned: Math.abs(actions.getBoundingClientRect().top - (bounds.top + bounds.bottom) / 2 + 42) < 1,
						statusAboveActions: status.getBoundingClientRect().bottom < actions.getBoundingClientRect().top,
						insideEditor: content.getBoundingClientRect().top >= container.getBoundingClientRect().top
							&& content.getBoundingClientRect().bottom <= container.getBoundingClientRect().bottom,
					});
				}
			}
		}
		assert.deepStrictEqual({ initialTranslate, results }, {
			initialTranslate: '',
			results: results.map(result => ({
				...result, visible: true, aligned: true, statusAboveActions: true, insideEditor: true,
			})),
		});
	});
});

suite('SessionChangesEditor spacing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('only the leading Changes card drops its outer gutter while later cards and other editors retain theirs', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		root.style.cssText = '--vscode-spacing-size40: 4px; --vscode-spacing-size80: 8px; --vscode-spacing-size320: 32px; --vscode-strokeThickness: 1px;';
		store.add(toDisposable(() => root.remove()));
		const results = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const changesEditor of [true, false]) {
				const body = append(root, $(changesEditor ? '.session-changes-editor-body' : '.other-editor-body'));
				for (const cards of [true, false]) {
					const widget = append(body, $('.monaco-component.multiDiffEditor.multiDiffEditor-compact'));
					widget.classList.toggle('multiDiffEditor-card', cards);
					for (const first of [true, false]) {
						const entry = append(widget, $('.multiDiffEntry'));
						entry.classList.toggle('first-diff-entry', first);
						const header = append(entry, $('.header'));
						header.setAttribute('aria-expanded', 'true');
						const content = append(header, $('.header-content'));
						for (const sticky of [false, true]) {
							header.classList.toggle('shadow', sticky);
							results.push({
								theme, changesEditor, cards, first, sticky,
								topMargin: mainWindow.getComputedStyle(content).marginTop,
							});
						}
					}
				}
				body.remove();
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(results, results.map(result => ({
			...result,
			topMargin: result.cards && !result.sticky && !(result.changesEditor && result.first) ? '4px' : '0px',
		})));
	});

	test('the leading card keeps the diff body at the same offset when its header becomes sticky', () => {
		const container = append(mainWindow.document.body, $('.session-changes-editor-body'));
		container.style.cssText = '--vscode-spacing-size40: 4px; --vscode-spacing-size80: 8px; --vscode-spacing-size320: 32px; --vscode-strokeThickness: 1px;';
		store.add(toDisposable(() => container.remove()));
		const widget = append(container, $('.monaco-component.multiDiffEditor.multiDiffEditor-compact.multiDiffEditor-card'));
		widget.style.cssText = 'width: 800px; height: 120px;';
		const content = append(widget, $('div'));
		const entry = append(content, $('.multiDiffEntry.first-diff-entry'));
		entry.style.cssText = 'position: absolute; width: 800px; height: 1000px;';
		const header = append(entry, $('.header'));
		header.setAttribute('aria-expanded', 'true');
		const headerContent = append(header, $('.header-content'));
		const body = append(entry, $('.editorParent'));
		const results = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			container.classList.add(theme);
			for (const top of [0, 10, 0]) {
				header.style.transform = `translateY(${top}px)`;
				header.classList.toggle('shadow', top > 0);
				results.push({
					theme, top,
					sticky: header.classList.contains('shadow'),
					headerFlowHeight: headerContent.offsetHeight + Number.parseFloat(mainWindow.getComputedStyle(headerContent).marginTop),
					bodyOffset: body.getBoundingClientRect().top - entry.getBoundingClientRect().top,
				});
			}
			container.classList.remove(theme);
		}
		assert.deepStrictEqual(results, ['vs', 'vs-dark', 'hc-black', 'hc-light'].flatMap(theme =>
			[0, 10, 0].map(top => ({ theme, top, sticky: top > 0, headerFlowHeight: 36, bodyOffset: 36 }))));
	});
});
