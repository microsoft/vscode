/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { ResourceTree } from '../../../../../base/common/resourceTree.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor, IDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { ISelection, Selection } from '../../../../../editor/common/core/selection.js';
import { EditorType, ScrollType } from '../../../../../editor/common/editorCommon.js';
import { SymbolKind } from '../../../../../editor/common/languages.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { DEFAULT_EDITOR_ASSOCIATION, ITextDiffEditorPane, IUntypedEditorInput } from '../../../../common/editor.js';
import { IEditorService, PreferredGroup, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { SCMAccessibilityProvider, SCMTreeDataSource, SCMTreeKeyboardNavigationLabelProvider, SCMTreeSorter } from '../../browser/scmViewPane.js';
import { SCMStructuralDiffRenderer, openSCMStructuralDiff } from '../../browser/scmStructuralDiffRenderer.js';
import { ISCMProvider, ISCMResource, ISCMResourceGroup, ISCMViewService, ViewMode } from '../../common/scm.js';
import { SCMStructuralDiffElement, SCMStructuralDiffModel, SCMStructuralDiffNode } from '../../common/scmStructuralDiff.js';

class TestCodeEditor extends mock<ICodeEditor>() {
	readonly selections: IRange[] = [];
	readonly reveals: IRange[] = [];
	focused = false;
	override setSelection(selection: IRange | ISelection): void { this.selections.push(Range.isIRange(selection) ? selection : Selection.liftSelection(selection)); }
	override revealRangeInCenterIfOutsideViewport(range: IRange, _scrollType?: ScrollType): void { this.reveals.push(range); }
	override focus(): void { this.focused = true; }
}

suite('SCM structural diff tree', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let resource: ISCMResource;
	let group: ISCMResourceGroup;
	let parent: SCMStructuralDiffNode;
	let child: SCMStructuralDiffNode;

	setup(() => {
		const provider = new class extends mock<ISCMProvider>() {
			override readonly id = 'test';
		};
		const resources: ISCMResource[] = [];
		group = new class extends mock<ISCMResourceGroup>() {
			override readonly id = 'workingTree';
			override readonly provider = provider;
			override readonly resources = resources;
			override readonly resourceTree: ResourceTree<ISCMResource, ISCMResourceGroup> = new ResourceTree(this, URI.file('/repo'));
		};
		resource = new class extends mock<ISCMResource>() {
			override readonly sourceUri = URI.file('/repo/folder/file.ts');
			override readonly resourceGroup = group;
			override readonly multiDiffEditorOriginalUri = URI.parse('git:/repo/folder/file.ts');
			override readonly multiDiffEditorModifiedUri = this.sourceUri;
		};
		resources.push(resource);
		group.resourceTree.add(resource.sourceUri, resource);
		const range = new Range(1, 1, 10, 1);
		const children: SCMStructuralDiffNode[] = [];
		parent = {
			type: 'structuralDiff', id: 'class', generation: 1, resource, parent: resource, order: 0, children,
			node: {
				id: 'class', original: { name: 'Calculator', kind: SymbolKind.Class, range }, modified: { name: 'Calculator', kind: SymbolKind.Class, range },
				originalChanges: [], modifiedChanges: [], children: [],
			},
		};
		child = {
			type: 'structuralDiff', id: 'method', generation: 1, resource, parent, order: 0, children: [],
			node: {
				id: 'method',
				original: { name: 'run', kind: SymbolKind.Method, range: new Range(2, 1, 4, 1), selectionRange: new Range(2, 2, 2, 5) },
				modified: { name: 'run', kind: SymbolKind.Method, range: new Range(3, 1, 5, 1), selectionRange: new Range(3, 2, 3, 5) },
				originalChanges: [], modifiedChanges: [], children: [],
			},
		};
		children.push(child);
	});

	for (const mode of [ViewMode.List, ViewMode.Tree]) {
		test(`exposes structural children and correct parents in ${mode} mode`, async () => {
			const structuralDiff = new class extends mock<SCMStructuralDiffModel>() {
				override hasChildren(candidate: ISCMResource): boolean { return candidate === resource; }
				override async getChildren(): Promise<readonly SCMStructuralDiffElement[]> { return [parent]; }
			};
			const viewService = new class extends mock<ISCMViewService>() {
				override readonly visibleRepositories = [];
			};
			const dataSource = store.add(new SCMTreeDataSource(() => mode, structuralDiff, new TestConfigurationService(), viewService));
			const top = [...await dataSource.getChildren(group)];
			const files = mode === ViewMode.Tree ? [...await dataSource.getChildren(top[0])] : top;
			assert.deepStrictEqual({
				files,
				expandable: [dataSource.hasChildren(resource), dataSource.hasChildren(parent), dataSource.hasChildren(child)],
				children: [...await dataSource.getChildren(resource)],
				nested: [...await dataSource.getChildren(parent)],
				parents: [dataSource.getParent(parent), dataSource.getParent(child)],
			}, { files: [resource], expandable: [true, true, false], children: [parent], nested: [child], parents: [resource, parent] });
		});

		test(`preserves provider order instead of applying file sorting in ${mode} mode`, () => {
			const sorter = new SCMTreeSorter(() => mode, () => { throw new Error('Must not sort structural children as files'); });
			const first = { ...child, order: 0, node: { ...child.node, modified: { ...child.node.modified!, name: 'zeta' } } };
			const second = { ...child, id: 'second', order: 1, node: { ...child.node, modified: { ...child.node.modified!, name: 'alpha' } } };
			assert.strictEqual(sorter.compare(first, second), -1);
		});
	}

	test('supports symbol-name keyboard navigation and meaningful screen-reader labels', () => {
		const labelService = new class extends mock<ILabelService>() { };
		const keyboard = new SCMTreeKeyboardNavigationLabelProvider(() => ViewMode.List, labelService);
		const accessibility = new SCMAccessibilityProvider(
			new class extends mock<IAccessibilityService>() { },
			new TestConfigurationService(),
			new class extends mock<IKeybindingService>() { },
			labelService,
		);
		assert.deepStrictEqual({
			keyboard: keyboard.getKeyboardNavigationLabel(child),
			aria: accessibility.getAriaLabel(child),
		}, { keyboard: 'run', aria: 'run, method' });
	});

	test('renders native symbol icons, deleted labels and partial-result status without file actions', () => {
		const renderer = new SCMStructuralDiffRenderer();
		const container = $('.scm-view');
		const label = store.add(renderer.renderTemplate(container));
		const render = (element: SCMStructuralDiffElement) => renderer.renderElement(new class extends mock<ITreeNode<SCMStructuralDiffElement, FuzzyScore>>() {
			override readonly element = element;
			override readonly filterData = FuzzyScore.Default;
		}, 0, label);
		render(parent);
		const classIcon = !!container.querySelector('.codicon-symbol-class');
		render({ ...child, node: { ...child.node, modified: undefined } });
		const deletedText = label.element.textContent;
		render({ type: 'structuralDiffStatus', id: 'partial', status: 'incomplete', parent: resource, resource, generation: 1, order: 1 });
		assert.deepStrictEqual({
			classIcon, deletedText, status: label.element.textContent,
			warning: !!container.querySelector('.codicon-warning'), actions: container.querySelectorAll('.actions').length,
		}, { classIcon: true, deletedText: 'runDeleted', status: 'Partial structural changes', warning: true, actions: 0 });
	});

	for (const side of ['original', 'modified'] as const) {
		for (const preserveFocus of [false, true]) {
			test(`opens the ${side} side and respects preserveFocus=${preserveFocus}`, async () => {
				const originalEditor = new TestCodeEditor();
				const modifiedEditor = new TestCodeEditor();
				const diffEditor = new class extends mock<IDiffEditor>() {
					override getEditorType(): string { return EditorType.IDiffEditor; }
					override getOriginalEditor(): ICodeEditor { return originalEditor; }
					override getModifiedEditor(): ICodeEditor { return modifiedEditor; }
				};
				const pane = new class extends mock<ITextDiffEditorPane>() {
					override getControl(): IDiffEditor { return diffEditor; }
				};
				const inputs: (IUntypedEditorInput | undefined)[] = [];
				const editorService = new class extends mock<IEditorService>() {
					override async openEditor(input: IUntypedEditorInput): Promise<ITextDiffEditorPane> { inputs.push(input); return pane; }
				};
				const element = side === 'modified' ? child : { ...child, node: { ...child.node, modified: undefined } };
				await openSCMStructuralDiff(element, { preserveFocus, pinned: true }, editorService, () => true);
				const range = element.node[side]!.selectionRange!;
				assert.deepStrictEqual({
					inputs,
					original: { selections: originalEditor.selections, reveals: originalEditor.reveals, focused: originalEditor.focused },
					modified: { selections: modifiedEditor.selections, reveals: modifiedEditor.reveals, focused: modifiedEditor.focused },
				}, {
					inputs: [{
						original: { resource: resource.multiDiffEditorOriginalUri },
						modified: { resource: resource.multiDiffEditorModifiedUri },
						options: { preserveFocus, pinned: true, override: DEFAULT_EDITOR_ASSOCIATION.id },
					}],
					original: { selections: side === 'original' ? [range] : [], reveals: side === 'original' ? [range] : [], focused: side === 'original' && !preserveFocus },
					modified: { selections: side === 'modified' ? [range] : [], reveals: side === 'modified' ? [range] : [], focused: side === 'modified' && !preserveFocus },
				});
			});
		}
	}

	test('does not navigate a stale result after asynchronous editor opening', async () => {
		const pending = new DeferredPromise<ITextDiffEditorPane | undefined>();
		const target = new TestCodeEditor();
		const control = new class extends mock<IDiffEditor>() {
			override getEditorType(): string { return EditorType.IDiffEditor; }
			override getOriginalEditor(): ICodeEditor { return target; }
			override getModifiedEditor(): ICodeEditor { return target; }
		};
		const pane = new class extends mock<ITextDiffEditorPane>() {
			override getControl(): IDiffEditor { return control; }
		};
		let current = true;
		const editorService = new class extends mock<IEditorService>() {
			override openEditor(_input: IUntypedEditorInput): Promise<ITextDiffEditorPane | undefined> { return pending.p; }
		};
		const opened = openSCMStructuralDiff(child, {}, editorService, () => current);
		current = false;
		await pending.complete(pane);
		await opened;
		assert.deepStrictEqual({ selections: target.selections, reveals: target.reveals, focused: target.focused }, { selections: [], reveals: [], focused: false });
	});

	test('supports side-by-side opening', async () => {
		const groups: (PreferredGroup | IEditorOptions | undefined)[] = [];
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(_input: IUntypedEditorInput, group?: PreferredGroup | IEditorOptions): Promise<ITextDiffEditorPane | undefined> {
				groups.push(group);
				return undefined;
			}
		};
		await openSCMStructuralDiff(child, {}, editorService, () => true, true);
		assert.deepStrictEqual(groups, [SIDE_GROUP]);
	});
});
