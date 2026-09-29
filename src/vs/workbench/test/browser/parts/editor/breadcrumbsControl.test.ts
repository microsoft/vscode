/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { addDisposableListener, Dimension } from '../../../../../base/browser/dom.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { IQuickAccessController } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { BreadcrumbsService, IBreadcrumbsService } from '../../../../browser/parts/editor/breadcrumbs.js';
import { BreadcrumbsControl } from '../../../../browser/parts/editor/breadcrumbsControl.js';
import { IEditorGroupsView, IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { IVisibleEditorPane } from '../../../../common/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IOutline, IOutlineService } from '../../../../services/outline/browser/outline.js';
import { IWorkspaceFolderLabelService, WorkspaceFolderLabelService } from '../../../../services/workspaces/common/workspaceFolderLabelService.js';
import { createFileStat, TestFileService } from '../../../common/workbenchTestServices.js';
import { TestFileEditorInput, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('BreadcrumbsControl', () => {
	const resource = URI.file('/path/image.svg');
	const disposables = new DisposableStore();
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let configurationService: TestConfigurationService;
	let contextViewService: IContextViewService;
	let control: BreadcrumbsControl;
	let widget: BreadcrumbsWidget;
	let container: HTMLElement;
	let editorElement: HTMLButtonElement;
	let group: IEditorGroupView;
	let activeGroup: IEditorGroupView;
	let editorFocusCalls: number;
	let pendingEditorFocus: (() => void)[];
	let fileRead: DeferredPromise<void>;
	let pickerFocused: DeferredPromise<void>;
	let outlineReveals: boolean[];
	let quickAccessPrefixes: string[];

	setup(() => {
		editorFocusCalls = 0;
		pendingEditorFocus = [];
		outlineReveals = [];
		quickAccessPrefixes = [];
		fileRead = new DeferredPromise<void>();
		pickerFocused = new DeferredPromise<void>();
		configurationService = new TestConfigurationService({
			breadcrumbs: { filePath: 'on', symbolPath: 'on', useQuickPick: false, icons: true },
			explorer: { decorations: { colors: false, badges: false } }
		});
		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
			fileService: () => disposables.add(new class extends TestFileService {
				override async resolve(uri: URI): Promise<IFileStatWithMetadata> {
					await fileRead.p;
					return createFileStat(uri, false, false, true, false, [{ resource }]);
				}
			})
		}, disposables);
		contextViewService = instantiationService.get(IContextViewService);
		instantiationService.stub(IBreadcrumbsService, new BreadcrumbsService());
		instantiationService.stub(IWorkspaceFolderLabelService, new WorkspaceFolderLabelService());
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override readonly quickAccess = new class extends mock<IQuickAccessController>() {
				override show(prefix: string) {
					quickAccessPrefixes.push(prefix);
				}
			};
		});

		container = mainWindow.document.createElement('div');
		editorElement = mainWindow.document.createElement('button');
		container.appendChild(editorElement);
		mainWindow.document.body.appendChild(container);
		disposables.add(addDisposableListener(mainWindow.document, 'focusin', e => {
			if (e.target instanceof HTMLElement && e.target.closest('.monaco-breadcrumbs-picker')) {
				pickerFocused.complete();
			}
		}));
	});

	teardown(async () => {
		contextViewService.hideContextView();
		disposables.clear();
		container.remove();
		// Breadcrumb pickers defer disposing their tree until the next turn.
		await timeout(0);
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createControl(withOutline = false): Promise<void> {
		const outline: IOutline<string> = {
			uri: resource,
			outlineKind: 'test',
			isEmpty: false,
			activeElement: 'symbol',
			onDidChange: Event.None,
			config: {
				breadcrumbsDataSource: { getBreadcrumbElements: () => [{ element: 'symbol', label: 'symbol' }] },
				quickPickDataSource: { getQuickPickElements: () => [] },
				treeDataSource: { getChildren: element => element === outline ? ['symbol'] : [] },
				delegate: { getHeight: () => 22, getTemplateId: () => 'symbol' },
				renderers: [{
					templateId: 'symbol',
					renderTemplate: node => node,
					renderElement: (node, _index, template: HTMLElement) => { template.textContent = node.element; },
					disposeTemplate: () => { }
				}],
				comparator: { compareByPosition: () => 0, compareByName: () => 0, compareByType: () => 0 },
				options: {
					accessibilityProvider: {
						getAriaLabel: element => element,
						getWidgetAriaLabel: () => 'Breadcrumb symbols'
					}
				}
			},
			reveal: (_element, _options, sideBySide) => { outlineReveals.push(sideBySide); },
			preview: () => Disposable.None,
			captureViewState: () => Disposable.None,
			dispose: () => { }
		};
		instantiationService.stub(IOutlineService, new class extends mock<IOutlineService>() {
			override readonly onDidChange = Event.None;
			override async createOutline() { return withOutline ? outline : undefined; }
		});
		const input = disposables.add(new TestFileEditorInput(resource, 'testEditorInput'));
		const pane = new class extends mock<IVisibleEditorPane>() {
			override readonly onDidChangeControl = Event.None;
			override focus() { group.focus(); }
		};
		const groupsView = new class extends mock<IEditorGroupsView>() {
			override activateGroup(target: IEditorGroupView) {
				activeGroup = target;
				return target;
			}
		};
		group = new class extends mock<IEditorGroupView>() {
			override readonly id = 1;
			override readonly activeEditor = input;
			override readonly activeEditorPane = pane;
			override readonly groupsView = groupsView;
			override focus() {
				activeGroup = this;
				editorFocusCalls++;
				editorElement.focus();
				// Model a webview focus message whose delivery can outlive the focus request.
				pendingEditorFocus.push(() => editorElement.focus());
			}
		};
		activeGroup = new class extends mock<IEditorGroupView>() {
			override readonly id = 2;
		};
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override get activeGroup() { return activeGroup; }
		});
		control = disposables.add(instantiationService.createInstance(BreadcrumbsControl, container, {
			showFileIcons: false,
			showSymbolIcons: true,
			showDecorationColors: false,
			showPlaceholder: false,
			dragEditor: false
		}, group));
		control.update();
		control.layout(new Dimension(600, BreadcrumbsControl.HEIGHT));
		widget = instantiationService.get(IBreadcrumbsService).getWidget(group.id)!;
		await Event.toPromise(control.model!.onDidUpdate);
		editorElement.focus();
	}

	function deliverEditorFocus(): void {
		for (const focus of pendingEditorFocus.splice(0)) {
			focus();
		}
	}

	function assertPickerFocused(): void {
		const picker = contextViewService.getContextViewElement().querySelector('.monaco-breadcrumbs-picker');
		assert.deepStrictEqual({
			activeGroup: activeGroup.id,
			editorFocusCalls,
			pickerFocused: !!picker?.contains(mainWindow.document.activeElement)
		}, { activeGroup: group.id, editorFocusCalls: 0, pickerFocused: true });
	}

	for (const input of ['mouse', 'keyboard'] as const) {
		for (const delivery of ['before', 'after'] as const) {
			test(`file picker keeps focus with ${input} input and editor focus delivery ${delivery} loading`, async () => {
				await createControl();
				if (input === 'mouse') {
					control.domNode.querySelector<HTMLElement>('.monaco-breadcrumb-item:last-child')!.click();
				} else {
					widget.setSelection(widget.getItems().at(-1), BreadcrumbsControl.Payload_Pick);
				}

				if (delivery === 'before') {
					deliverEditorFocus();
				}
				await fileRead.complete();
				await pickerFocused.p;
				if (delivery === 'after') {
					deliverEditorFocus();
				}
				await timeout(0);
				assertPickerFocused();
			});
		}
	}

	test('outline picker activates its group without focusing the editor', async () => {
		await createControl(true);
		widget.setSelection(widget.getItems().at(-1), BreadcrumbsControl.Payload_Pick);
		await pickerFocused.p;
		deliverEditorFocus();
		await timeout(0);
		assertPickerFocused();
	});

	for (const withOutline of [false, true]) {
		test(`picking a ${withOutline ? 'symbol' : 'file'} closes the picker and reveals the selection`, async () => {
			await createControl(withOutline);
			const openEditor = spy(instantiationService.get(IEditorService), 'openEditor');
			widget.setSelection(widget.getItems().at(-1), BreadcrumbsControl.Payload_Pick);
			await fileRead.complete();
			await pickerFocused.p;
			await timeout(0);
			contextViewService.getContextViewElement().querySelector('.monaco-list-row')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			await timeout(0);
			const expectedReveal = withOutline ? [false] : [
				{ resource, options: { preserveFocus: false, pinned: true, revealIfVisible: true } },
				undefined
			];
			assert.deepStrictEqual({
				activeGroup: activeGroup.id,
				reveal: withOutline ? outlineReveals : openEditor.firstCall?.args,
				picker: contextViewService.getContextViewElement().querySelector('.monaco-breadcrumbs-picker')
			}, { activeGroup: group.id, reveal: expectedReveal, picker: null });
		});

		test(`${withOutline ? 'symbol' : 'file'} quick access activates its group without focusing the editor`, async () => {
			await configurationService.setUserConfiguration('breadcrumbs.useQuickPick', true);
			await createControl(withOutline);
			widget.setSelection(widget.getItems().at(-1), BreadcrumbsControl.Payload_Pick);
			assert.deepStrictEqual({
				activeGroup: activeGroup.id,
				editorFocusCalls,
				quickAccessPrefixes
			}, { activeGroup: group.id, editorFocusCalls: 0, quickAccessPrefixes: [withOutline ? '@' : ''] });
		});

		for (const sideBySide of [false, true]) {
			test(`revealing a ${withOutline ? 'symbol' : 'file'} ${sideBySide ? 'to the side' : 'in place'} still focuses the editor`, async () => {
				await createControl(withOutline);
				const openEditor = spy(instantiationService.get(IEditorService), 'openEditor');
				widget.setSelection(widget.getItems().at(-1), sideBySide ? BreadcrumbsControl.Payload_RevealAside : BreadcrumbsControl.Payload_Reveal);
				assert.deepStrictEqual({
					activeGroup: activeGroup.id,
					editorFocusCalls,
					destination: withOutline ? outlineReveals : openEditor.lastCall.args[1]
				}, { activeGroup: group.id, editorFocusCalls: 1, destination: withOutline ? [sideBySide] : sideBySide ? SIDE_GROUP : ACTIVE_GROUP });
			});
		}
	}

	test('revealing a folder opens the next picker without focusing the editor', async () => {
		await createControl();
		widget.setSelection(widget.getItems()[0], BreadcrumbsControl.Payload_Reveal);
		await fileRead.complete();
		await pickerFocused.p;
		deliverEditorFocus();
		await timeout(0);
		assertPickerFocused();
	});

	test('Escape returns focus to the owning editor', async () => {
		await createControl();
		widget.setSelection(widget.getItems().at(-1), BreadcrumbsControl.Payload_Pick);
		await fileRead.complete();
		await pickerFocused.p;
		instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('breadcrumbs.selectEditor')!.handler(accessor));
		await timeout(0);
		assert.deepStrictEqual({
			activeGroup: activeGroup.id,
			editorFocusCalls,
			editorFocused: mainWindow.document.activeElement === editorElement,
			picker: contextViewService.getContextViewElement().querySelector('.monaco-breadcrumbs-picker')
		}, { activeGroup: group.id, editorFocusCalls: 1, editorFocused: true, picker: null });
	});

	test('moving focus outside still dismisses the picker', async () => {
		await createControl();
		widget.setSelection(widget.getItems().at(-1), BreadcrumbsControl.Payload_Pick);
		await fileRead.complete();
		await pickerFocused.p;
		editorElement.focus();
		await timeout(0);
		assert.strictEqual(contextViewService.getContextViewElement().querySelector('.monaco-breadcrumbs-picker'), null);
	});

	test('repeatedly opening the picker in the active group does not focus the editor', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await createControl();
		activeGroup = group;
		await fileRead.complete();
		for (let i = 0; i < 10; i++) {
			pickerFocused = new DeferredPromise<void>();
			control.domNode.querySelector<HTMLElement>('.monaco-breadcrumb-item:last-child')!.click();
			await pickerFocused.p;
			deliverEditorFocus();
			await timeout(0);
			assertPickerFocused();
			editorElement.focus();
			await timeout(0);
		}
	}));
});
