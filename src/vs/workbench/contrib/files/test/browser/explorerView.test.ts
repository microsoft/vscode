/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { ExplorerItem } from '../../common/explorerModel.js';
import { ExplorerView, getContext, shouldPreserveWorkspaceNameCase } from '../../browser/views/explorerView.js';
import { listInvalidItemForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { CompressedNavigationController, ExplorerDataSource, ExplorerFindProvider, FileDragAndDrop, FilesFilter, FilesRenderer, FileSorter, ICompressedNavigationController } from '../../browser/views/explorerViewer.js';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { provideDecorations } from '../../browser/views/explorerDecorationsProvider.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullFilesConfigurationService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { TestEnvironmentService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkspace, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { IExplorerService } from '../../browser/files.js';
import { ResourceLabels } from '../../../../browser/labels.js';
import { hasKey } from '../../../../../base/common/types.js';

class TestExplorerView extends ExplorerView {
	renderForTesting(container: HTMLElement): void {
		this.renderBody(container);
	}
}

suite('Files - ExplorerView', () => {

	const $ = dom.$;

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const fileService = new TestFileService();
	const configService = new TestConfigurationService();


	function createStat(this: any, path: string, name: string, isFolder: boolean, hasChildren: boolean, size: number, mtime: number, isSymLink = false, isUnknown = false): ExplorerItem {
		return new ExplorerItem(toResource.call(this, path), fileService, configService, NullFilesConfigurationService, undefined, isFolder, isSymLink, false, false, name, mtime, isUnknown);
	}

	test('getContext', async function () {
		const d = new Date().getTime();
		const s1 = createStat.call(this, '/', '/', true, false, 8096, d);
		const s2 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s4 = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d);
		const noNavigationController = { getCompressedNavigationController: (stat: ExplorerItem) => undefined };

		assert.deepStrictEqual(getContext([s1], [s2, s3, s4], true, noNavigationController), [s2, s3, s4]);
		assert.deepStrictEqual(getContext([s1], [s1, s3, s4], true, noNavigationController), [s1, s3, s4]);
		assert.deepStrictEqual(getContext([s1], [s3, s1, s4], false, noNavigationController), [s1]);
		assert.deepStrictEqual(getContext([], [s3, s1, s4], false, noNavigationController), []);
		assert.deepStrictEqual(getContext([], [s3, s1, s4], true, noNavigationController), [s3, s1, s4]);
	});

	suite('context menu', () => {
		let view: TestExplorerView;
		let tree: WorkbenchCompressibleAsyncDataTree<ExplorerItem | ExplorerItem[], ExplorerItem, FuzzyScore>;
		let menu: IContextMenuMenuDelegate | undefined;
		let menuShown: Emitter<void>;
		let root: ExplorerItem;
		let folder: ExplorerItem;
		let first: ExplorerItem;
		let second: ExplorerItem;
		let target: ExplorerItem;
		let opened: ExplorerItem[];
		let controllers: Map<ExplorerItem, ICompressedNavigationController[]>;

		setup(async () => {
			const createItem = (path: string, isDirectory = false) => new ExplorerItem(URI.file(path), fileService, configService, NullFilesConfigurationService, undefined, isDirectory);
			root = createItem('/workspace', true);
			folder = createItem('/workspace/folder', true);
			first = createItem('/workspace/folder/first.txt');
			second = createItem('/workspace/folder/second.txt');
			target = createItem('/workspace/target.txt');
			root.addChild(folder);
			root.addChild(target);
			folder.addChild(first);
			folder.addChild(second);
			menu = undefined;
			menuShown = ds.add(new Emitter<void>());
			opened = [];
			controllers = new Map();

			const instantiationService = workbenchInstantiationService({
				configurationService: () => new TestConfigurationService({ explorer: { autoReveal: false, compactFolders: false } }),
			}, ds);
			instantiationService.stub(IViewDescriptorService, {
				onDidChangeLocation: Event.None,
				getViewLocationById: () => ViewContainerLocation.Sidebar,
			});
			instantiationService.stub(IExplorerService, {
				roots: [root],
				registerView: () => { },
				findClosest: () => root,
				isEditable: () => false,
				getEditable: () => undefined,
			});
			instantiationService.stub(IClipboardService, new TestClipboardService());
			instantiationService.stub(IContextMenuService, {
				showContextMenu: delegate => {
					assert.ok(hasKey(delegate, { menuActionOptions: true }));
					menu = delegate;
					menuShown.fire();
				},
			});
			instantiationService.stub(IEditorResolverService, {
				getEditors: () => [],
			});
			instantiationService.stub(IOpenerService, {});

			view = ds.add(instantiationService.createInstance(TestExplorerView, {
				id: 'testExplorerContextMenu',
				title: 'Explorer',
				delegate: { willOpenElement: () => { }, didOpenElement: () => { } },
			}));

			const container = dom.append(document.body, $('.explorer-context-menu-test'));
			ds.add(toDisposable(() => container.remove()));
			tree = ds.add(instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree<ExplorerItem | ExplorerItem[], ExplorerItem, FuzzyScore>,
				'ExplorerContextMenuTest', container,
				{ getHeight: () => 20, getTemplateId: () => 'test' },
				{ isIncompressible: item => !item.isDirectory },
				[{
					templateId: 'test',
					renderTemplate: container => container,
					renderElement: (node, _index, container) => {
						container.textContent = node.element.name;
						container.dataset.resource = node.element.resource.toString();
					},
					renderCompressedElements: (node, _index, container) => {
						container.textContent = node.element.elements.map(item => item.name).join('/');
						container.dataset.resource = node.element.elements.at(-1)!.resource.toString();
					},
					disposeTemplate: () => { },
				}],
				{
					hasChildren: item => Array.isArray(item) || item.children.size > 0,
					getChildren: item => Array.isArray(item) ? item : [...item.children.values()],
				},
				{
					compressionEnabled: false,
					collapseByDefault: () => false,
					accessibilityProvider: { getAriaLabel: item => item.name, getWidgetAriaLabel: () => 'Explorer' },
					identityProvider: { getId: item => item.resource.toString() },
				}));
			tree.layout(300, 400);
			await tree.setInput(root);
			await tree.expand(folder);
			ds.add(tree.onDidOpen(e => {
				if (e.element) {
					opened.push(e.element);
				}
			}));

			instantiationService.stubInstance(WorkbenchCompressibleAsyncDataTree<ExplorerItem | ExplorerItem[], ExplorerItem, FuzzyScore>, tree);
			instantiationService.stubInstance(ResourceLabels, { dispose: () => { } });
			instantiationService.stubInstance(FilesFilter, { onDidChange: Event.None, dispose: () => { } });
			instantiationService.stubInstance(ExplorerFindProvider, { isShowingFilterResults: () => false });
			instantiationService.stubInstance(ExplorerDataSource, {});
			instantiationService.stubInstance(FileSorter, {});
			instantiationService.stubInstance(FileDragAndDrop, {});
			instantiationService.stubInstance(FilesRenderer, {
				getCompressedNavigationController: item => controllers.get(item),
				dispose: () => { },
			});
			view.renderForTesting(container);
		});

		function getContextMenuTarget(item: ExplorerItem | null): HTMLElement {
			if (!item) {
				return tree.getHTMLElement();
			}

			const element = Array.from(tree.getHTMLElement().querySelectorAll<HTMLElement>('[data-resource]')).find(element => element.dataset.resource === item.resource.toString());
			assert.ok(element);
			return element;
		}

		async function showContextMenu(item: ExplorerItem | null, browserEvent: UIEvent = new MouseEvent('contextmenu', { button: 2, bubbles: true })): Promise<void> {
			tree.setFocus(item ? [item] : []);
			const shown = Event.toPromise(menuShown.event);
			getContextMenuTarget(item).dispatchEvent(browserEvent);
			await shown;
		}

		async function showKeyboardContextMenu(item: ExplorerItem): Promise<void> {
			const event = new KeyboardEvent('keyup', { key: 'F10', shiftKey: true, bubbles: true });
			// StandardKeyboardEvent reads the legacy keyCode, which some browsers ignore in KeyboardEventInit.
			Object.defineProperty(event, 'keyCode', { get: () => 121 });
			await showContextMenu(item, event);
		}

		function assertContext(expected: ExplorerItem[], clicked: ExplorerItem): void {
			assert.deepStrictEqual({
				selection: tree.getSelection().map(item => item.resource),
				commandTargets: view.getContext(true).map(item => item.resource),
				menuTarget: menu?.menuActionOptions?.arg,
				menuSelection: menu?.getActionsContext?.(),
				opened: opened.map(item => item.resource),
			}, {
				selection: expected.map(item => item.resource),
				commandTargets: expected.map(item => item.resource),
				menuTarget: clicked.resource,
				menuSelection: expected.map(item => item.resource),
				opened: [],
			});
		}

		for (const selectionSize of [0, 1, 2]) {
			test(`selects an unselected item with ${selectionSize} previously selected items`, async () => {
				tree.setSelection([first, second].slice(0, selectionSize));

				await showContextMenu(target);

				assertContext([target], target);
			});
		}

		for (const selectionSize of [1, 2]) {
			test(`preserves ${selectionSize} selected items when the target belongs to the selection`, async () => {
				const selection = [first, second].slice(0, selectionSize);
				tree.setSelection(selection);

				await showContextMenu(first);

				assertContext(selection, first);
			});
		}

		test('replaces a selection hidden in a collapsed folder', async () => {
			tree.setSelection([first, second]);
			tree.collapse(folder);
			assert.deepStrictEqual(tree.getSelection(), [first, second]);

			await showContextMenu(target);

			assertContext([target], target);
		});

		test('keeps the compressed-folder navigation target when replacing the selection', async () => {
			const parent = new ExplorerItem(URI.file('/workspace/compact'), fileService, configService, NullFilesConfigurationService, root, true);
			const child = new ExplorerItem(URI.file('/workspace/compact/child'), fileService, configService, NullFilesConfigurationService, parent, true);
			root.addChild(parent);
			parent.addChild(child);
			tree.updateOptions({ compressionEnabled: true });
			await tree.updateChildren(root);
			const controller = new class extends mock<ICompressedNavigationController>() {
				override readonly current = parent;
				override readonly items = [parent, child];
				override readonly index = 0;
				override readonly count = 2;
			};
			controllers.set(parent, [controller]);
			controllers.set(child, [controller]);
			tree.setSelection([first, second]);

			await showContextMenu(child);

			assert.deepStrictEqual({
				selection: tree.getSelection(),
				commandTargets: view.getContext(true),
				menuTarget: menu?.menuActionOptions?.arg,
			}, {
				selection: [child],
				commandTargets: [parent],
				menuTarget: parent.resource,
			});
		});

		test('selects the keyboard context-menu target without opening it', async () => {
			tree.setSelection([first, second]);

			await showKeyboardContextMenu(target);

			assertContext([target], target);
		});

		test('preserves multi-selection for a keyboard context menu on a selected item', async () => {
			tree.setSelection([first, second]);

			await showKeyboardContextMenu(first);

			assertContext([first, second], first);
		});

		test('preserves the selection when cancelling the context menu', async () => {
			tree.setSelection([first, second]);

			await showContextMenu(first);
			menu?.onHide?.(true);

			assertContext([first, second], first);
		});

		test('keeps the newly selected target when cancelling the context menu', async () => {
			tree.setSelection([first, second]);

			await showContextMenu(target);
			menu?.onHide?.(true);

			assertContext([target], target);
		});

		test('leaves the selection unchanged for an editable input', () => {
			tree.setSelection([first, second]);

			const input = dom.append(getContextMenuTarget(target), $('input'));
			input.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true }));

			assert.deepStrictEqual({ selection: tree.getSelection(), menu }, { selection: [first, second], menu: undefined });
		});

		test('preserves the background context menu', async () => {
			tree.setSelection([first, second]);

			await showContextMenu(null);

			assert.deepStrictEqual({
				selection: tree.getSelection(),
				menuTarget: menu?.menuActionOptions?.arg,
				menuSelection: menu?.getActionsContext?.(),
			}, {
				selection: [first, second],
				menuTarget: root.resource,
				menuSelection: [],
			});
		});

		test('keeps bulk keyboard commands on the selection after deselecting the focused item', () => {
			tree.setSelection([first, second, target]);
			tree.setFocus([target]);
			tree.setSelection([first, second]);

			assert.deepStrictEqual(view.getContext(true), [first, second]);
		});
	});

	test('decoration provider', async function () {
		const d = new Date().getTime();
		const s1 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		s1.error = new Error('A test error');
		const s2 = createStat.call(this, '/path/to', 'to', true, false, 8096, d, true);
		const s3 = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d);
		assert.strictEqual(provideDecorations(s3), undefined);
		assert.deepStrictEqual(provideDecorations(s2), {
			tooltip: 'Symbolic Link',
			letter: '\u2937'
		});
		assert.deepStrictEqual(provideDecorations(s1), {
			tooltip: 'Unable to resolve workspace folder (A test error)',
			letter: '!',
			color: listInvalidItemForeground
		});

		const unknown = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d, false, true);
		assert.deepStrictEqual(provideDecorations(unknown), {
			tooltip: 'Unknown File Type',
			letter: '?'
		});
	});

	test('preserves workspace name case only for user named workspaces', async function () {
		const untitledWorkspacesHome = TestEnvironmentService.untitledWorkspacesHome;
		function workspace(configuration: URI | null): IWorkspace {
			return { id: 'test', folders: [], configuration };
		}

		assert.deepStrictEqual({
			empty: shouldPreserveWorkspaceNameCase(WorkbenchState.EMPTY, workspace(null), TestEnvironmentService),
			folder: shouldPreserveWorkspaceNameCase(WorkbenchState.FOLDER, workspace(null), TestEnvironmentService),
			untitled: shouldPreserveWorkspaceNameCase(WorkbenchState.WORKSPACE, workspace(joinPath(untitledWorkspacesHome, '1234', 'workspace.json')), TestEnvironmentService),
			untitledDifferentCase: shouldPreserveWorkspaceNameCase(WorkbenchState.WORKSPACE, workspace(joinPath(untitledWorkspacesHome.with({ path: untitledWorkspacesHome.path.toUpperCase() }), '1234', 'workspace.json')), TestEnvironmentService),
			named: shouldPreserveWorkspaceNameCase(WorkbenchState.WORKSPACE, workspace(URI.file('/some/path/myWorkspace.code-workspace')), TestEnvironmentService),
		}, {
			empty: false,
			folder: true,
			untitled: false,
			untitledDifferentCase: false,
			named: true,
		});
	});

	test('compressed navigation controller', async function () {
		const container = $('.file');
		const label = $('.label');
		const labelName1 = $('.label-name');
		const labelName2 = $('.label-name');
		const labelName3 = $('.label-name');
		const d = new Date().getTime();
		const s1 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s2 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d);

		dom.append(container, label);
		dom.append(label, labelName1);
		dom.append(label, labelName2);
		dom.append(label, labelName3);
		const emitter = new Emitter<void>();

		const navigationController = new CompressedNavigationController('id', [s1, s2, s3], {
			container,
			templateDisposables: ds.add(new DisposableStore()),
			elementDisposables: ds.add(new DisposableStore()),
			contribs: [],
			// eslint-disable-next-line local/code-no-any-casts
			label: <any>{
				container: label,
				onDidRender: emitter.event
			},
		}, 1, false);

		ds.add(navigationController);

		assert.strictEqual(navigationController.count, 3);
		assert.strictEqual(navigationController.index, 2);
		assert.strictEqual(navigationController.current, s3);
		navigationController.next();
		assert.strictEqual(navigationController.current, s3);
		navigationController.previous();
		assert.strictEqual(navigationController.current, s2);
		navigationController.previous();
		assert.strictEqual(navigationController.current, s1);
		navigationController.previous();
		assert.strictEqual(navigationController.current, s1);
		navigationController.last();
		assert.strictEqual(navigationController.current, s3);
		navigationController.first();
		assert.strictEqual(navigationController.current, s1);
		navigationController.setIndex(1);
		assert.strictEqual(navigationController.current, s2);
		navigationController.setIndex(44);
		assert.strictEqual(navigationController.current, s2);
	});
});
