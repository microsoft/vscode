/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { List } from '../../../../../base/browser/ui/list/listWidget.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { OpenEditor } from '../../common/files.js';
import { CloseGroupAction, SaveAllInGroupAction } from '../../browser/fileActions.js';
import { findFirstDirtyEditor, OpenEditorsView } from '../../browser/views/openEditorsView.js';
import { GroupModelChangeKind } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IGroupModelChangeEvent } from '../../../../common/editor/editorGroupModel.js';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { IEditorGroupsService, IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { DecorationsService } from '../../../../services/decorations/browser/decorationsService.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { CloseEditorAction, UnpinEditorAction } from '../../../../browser/parts/editor/editorActions.js';
import { TestEditorGroupsService, TestEditorGroupView, TestEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('Files - OpenEditorsView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	class TestDirtyEditorInput extends TestEditorInput {
		override isDirty(): boolean {
			return true;
		}
	}

	const delegate: IListVirtualDelegate<OpenEditor> = {
		getHeight: () => 20,
		getTemplateId: () => 'openEditor'
	};
	const renderer: IListRenderer<OpenEditor, void> = {
		templateId: 'openEditor',
		renderTemplate: () => undefined,
		renderElement: () => undefined,
		disposeTemplate: () => undefined
	};

	function createList(): List<OpenEditor> {
		const editorIds = new WeakMap<object, number>();
		let editorIdPool = 0;

		return store.add(new List<OpenEditor>('OpenEditors', document.createElement('div'), delegate, [renderer], {
			identityProvider: {
				getId: openEditor => {
					let editorId = editorIds.get(openEditor.editor);
					if (editorId === undefined) {
						editorId = editorIdPool++;
						editorIds.set(openEditor.editor, editorId);
					}

					return `openeditor:${openEditor.groupId}:${editorId}`;
				}
			}
		}));
	}

	function createView(groups: TestEditorGroupView[], configurationService: TestConfigurationService) {
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, store);
		instantiationService.stubInstance(CloseEditorAction, store.add(instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL)));
		instantiationService.stubInstance(UnpinEditorAction, store.add(instantiationService.createInstance(UnpinEditorAction, UnpinEditorAction.ID, UnpinEditorAction.LABEL)));
		instantiationService.stubInstance(SaveAllInGroupAction, store.add(instantiationService.createInstance(SaveAllInGroupAction, SaveAllInGroupAction.ID, SaveAllInGroupAction.LABEL)));
		instantiationService.stubInstance(CloseGroupAction, store.add(instantiationService.createInstance(CloseGroupAction, CloseGroupAction.ID, CloseGroupAction.LABEL)));
		instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService(groups));
		const viewContainer = new class extends mock<ViewContainer>() {
			override readonly id = 'workbench.view.explorer';
		};
		instantiationService.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			getViewLocationById: () => ViewContainerLocation.Sidebar,
			getViewDescriptorById: () => null,
			getViewContainerByViewId: () => viewContainer,
			getDefaultContainerById: () => viewContainer,
			getViewContainerModel: () => new class extends mock<IViewContainerModel>() {
				override readonly visibleViewDescriptors = [OpenEditorsView.ID, 'workbench.explorer.fileView'].map(id => new class extends mock<IViewDescriptor>() {
					override readonly id = id;
				}());
				override readonly onDidChangeAllViewDescriptors = Event.None;
				override readonly onDidChangeContainerInfo = Event.None;
			}
		});
		const decorations = store.add(instantiationService.createInstance(DecorationsService));
		instantiationService.stub(IDecorationsService, decorations);
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		const view = store.add(instantiationService.createInstance(OpenEditorsView, { id: OpenEditorsView.ID, title: 'Open Editors' }));
		view.render();
		container.appendChild(view.element);
		return { view, decorations };
	}

	for (const visibility of ['visible', 'visible with delayed refresh', 'visible with pending refresh', 'hidden', 'hidden with queued notification', 'hidden with pending refresh'] as const) {
		test(`released terminal editor rows do not recreate decorations (${visibility})`, async () => {
			const configurationService = new TestConfigurationService({
				files: {},
				explorer: { decorations: { colors: true, badges: true }, openEditors: { sortOrder: 'editorOrder' } }
			});
			const modelChanged = store.add(new Emitter<IGroupModelChangeEvent>());
			const group = new class extends TestEditorGroupView {
				override readonly onDidModelChange = modelChanged.event;
				override contains(editor: EditorInput): boolean {
					return this.editors.includes(editor);
				}
			}(1);
			const file = store.add(new TestEditorInput(URI.file('/surviving.txt'), 'testEditor'));
			group.editors = [file];
			group.count = 1;
			group.activeEditor = file;
			const clock = sinon.useFakeTimers();
			try {
				const { view, decorations } = createView([group], configurationService);
				view.setVisible(true);
				const list = Reflect.get(view, 'list') as WorkbenchList<OpenEditor | IEditorGroup>;
				list.layout(200, 400);
				await clock.runAllAsync();
				const cache = Reflect.get(decorations, '_data') as { get(resource: URI): object | undefined };
				const closedResources: URI[] = [];
				for (let i = 0; i < 3; i++) {
					const terminal = store.add(new TestEditorInput(URI.parse(`vscode-terminal:/test/${i}`), 'testEditor'));
					group.editors = [terminal, file];
					group.count = 2;
					modelChanged.fire({ kind: GroupModelChangeKind.EDITOR_OPEN, editor: terminal });
					await clock.runAllAsync();
					assert.ok(cache.get(terminal.resource));
					const hidden = visibility.startsWith('hidden');
					if (hidden) {
						list.setSelection([0, 1]);
						view.setVisible(false);
						view.setVisible(true);
						assert.deepStrictEqual(list.getSelection(), [0, 1]);
						if (visibility === 'hidden with pending refresh') {
							view.setStructuralRefreshDelay(200);
							modelChanged.fire({ kind: GroupModelChangeKind.EDITOR_MOVE, editor: terminal });
						}
						view.setVisible(false);
					}
					if (visibility === 'visible with delayed refresh' || visibility === 'visible with pending refresh') {
						view.setStructuralRefreshDelay(250);
						if (visibility === 'visible with pending refresh') {
							modelChanged.fire({ kind: GroupModelChangeKind.EDITOR_MOVE, editor: terminal });
							await clock.tickAsync(50);
						}
					}
					decorations.clearCachedDecorations(terminal.resource);
					group.editors = [file];
					group.count = 1;
					modelChanged.fire({ kind: GroupModelChangeKind.EDITOR_CLOSE, editor: terminal });
					if (visibility === 'hidden' || visibility === 'hidden with pending refresh') {
						await clock.tickAsync(100);
					}
					if (visibility === 'visible with delayed refresh' || visibility === 'visible with pending refresh') {
						await clock.tickAsync(100);
						assert.strictEqual(list.length, 2, 'structural refresh remains delayed');
						assert.strictEqual(cache.get(terminal.resource), undefined);
						list.rerender();
						assert.strictEqual(cache.get(terminal.resource), undefined, 'rerendering pending rows does not restore closed labels');
					}
					if (hidden) {
						view.setVisible(true);
						assert.strictEqual(cache.get(terminal.resource), undefined);
					}
					await clock.runAllAsync();
					assert.deepStrictEqual(list.getSelectedElements().map(element => element instanceof OpenEditor ? element.editor : undefined), [file]);
					closedResources.push(terminal.resource);
					assert.deepStrictEqual(closedResources.map(resource => cache.get(resource)), closedResources.map(() => undefined));
				}
				// Reused rows must still render decorations for resources that remain open.
				decorations.clearCachedDecorations(file.resource);
				await clock.runAllAsync();
				assert.ok(cache.get(file.resource));
			} finally {
				clock.restore();
			}
		});
	}

	for (const visibility of ['hidden', 'collapsed'] as const) {
		for (const editorCount of [1, 3]) {
			for (const groupCount of [1, 2]) {
				test(`resizes after closing all editors while ${visibility} (${editorCount} editors, ${groupCount} groups)`, async () => {
					const configurationService = new TestConfigurationService({
						files: {},
						explorer: { openEditors: { sortOrder: 'editorOrder', minVisible: 0 } }
					});
					const modelChanged = store.add(new Emitter<IGroupModelChangeEvent>());
					const group = new class extends TestEditorGroupView {
						override readonly onDidModelChange = modelChanged.event;
						override contains(editor: EditorInput): boolean {
							return this.editors.includes(editor);
						}
					}(1);
					const editors = Array.from({ length: editorCount }, (_, i) => store.add(new TestEditorInput(URI.file(`/file${i}.txt`), 'testEditor')));
					group.editors = editors;
					group.count = editorCount;
					const groups = [group];
					if (groupCount === 2) {
						const emptyGroup = new TestEditorGroupView(2);
						emptyGroup.count = 0;
						groups.push(emptyGroup);
					}
					const clock = sinon.useFakeTimers();
					try {
						const { view } = createView(groups, configurationService);
						view.setVisible(true);
						await clock.runAllAsync();
						const groupRows = groupCount > 1 ? groupCount : 0;
						assert.deepStrictEqual([view.minimumBodySize, view.maximumBodySize], [(editorCount + groupRows) * 22, (editorCount + groupRows) * 22]);
						if (visibility === 'hidden') {
							view.setVisible(false);
						} else {
							view.setExpanded(false);
						}
						group.editors = [];
						group.count = 0;
						for (const editor of editors) {
							modelChanged.fire({ kind: GroupModelChangeKind.EDITOR_CLOSE, editor });
						}
						await clock.runAllAsync();
						if (visibility === 'hidden') {
							view.setVisible(true);
						} else {
							view.setExpanded(true);
						}
						await clock.runAllAsync();
						assert.deepStrictEqual([view.minimumBodySize, view.maximumBodySize], [groupRows * 22, groupRows * 22]);
					} finally {
						clock.restore();
					}
				});
			}
		}
	}

	test('preserves multi-selection when an editor is refreshed', () => {
		const group = new TestEditorGroupView(1);
		const firstEditor = store.add(new TestEditorInput(URI.parse('test:/first'), 'testEditor'));
		const secondEditor = store.add(new TestEditorInput(URI.parse('test:/second'), 'testEditor'));
		const list = createList();

		list.splice(0, 0, [new OpenEditor(firstEditor, group), new OpenEditor(secondEditor, group)]);
		list.setSelection([0, 1]);
		list.splice(1, 1, [new OpenEditor(secondEditor, group)]);

		assert.deepStrictEqual(list.getSelection(), [0, 1]);
	});

	test('preserves multi-selection when editors are resorted', () => {
		const group = new TestEditorGroupView(1);
		const firstEditor = store.add(new TestEditorInput(URI.parse('test:/first'), 'testEditor'));
		const secondEditor = store.add(new TestEditorInput(URI.parse('test:/second'), 'testEditor'));
		const thirdEditor = store.add(new TestEditorInput(URI.parse('test:/third'), 'testEditor'));
		const list = createList();

		list.splice(0, 0, [new OpenEditor(firstEditor, group), new OpenEditor(secondEditor, group), new OpenEditor(thirdEditor, group)]);
		list.setSelection([0, 1]);
		list.splice(0, list.length, [new OpenEditor(thirdEditor, group), new OpenEditor(firstEditor, group), new OpenEditor(secondEditor, group)]);

		assert.deepStrictEqual(list.getSelection(), [1, 2]);
	});

	test('finds the first unsaved editor in index order', () => {
		const firstGroup = new TestEditorGroupView(1);
		const secondGroup = new TestEditorGroupView(2);
		const savedEditor = store.add(new TestEditorInput(URI.parse('test:/saved'), 'testEditor'));
		const firstDirtyEditor = store.add(new TestDirtyEditorInput(URI.parse('test:/firstDirty'), 'testEditor'));
		const secondDirtyEditor = store.add(new TestDirtyEditorInput(URI.parse('test:/secondDirty'), 'testEditor'));

		firstGroup.editors = [savedEditor];
		secondGroup.editors = [savedEditor, firstDirtyEditor, secondDirtyEditor];

		const firstDirty = findFirstDirtyEditor([firstGroup, secondGroup]);

		assert.deepStrictEqual({ editor: firstDirty?.editor, group: firstDirty?.group }, { editor: firstDirtyEditor, group: secondGroup });
	});

	test('finds no unsaved editor when all editors are saved', () => {
		const group = new TestEditorGroupView(1);
		const savedEditor = store.add(new TestEditorInput(URI.parse('test:/saved'), 'testEditor'));

		group.editors = [savedEditor];

		assert.strictEqual(findFirstDirtyEditor([group]), undefined);
	});
});
