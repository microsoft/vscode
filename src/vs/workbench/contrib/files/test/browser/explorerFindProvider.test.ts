/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { TreeFindMatchType, TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { ITreeCompressionDelegate } from '../../../../../base/browser/ui/tree/asyncDataTree.js';
import { ICompressedTreeNode } from '../../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../../base/browser/ui/tree/objectTree.js';
import { IAsyncDataSource, ITreeFilter, ITreeNode, TreeFilterResult } from '../../../../../base/browser/ui/tree/tree.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchCompressibleAsyncDataTreeOptions, WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IFileMatch, IFileQuery, ISearchComplete, ISearchService } from '../../../../services/search/common/search.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { IExplorerService } from '../../browser/files.js';
import { ExplorerFindProvider, FilesFilter } from '../../browser/views/explorerViewer.js';
import { ExplorerItem } from '../../common/explorerModel.js';

function find(element: ExplorerItem, id: string): ExplorerItem | undefined {
	if (element.name === id) {
		return element;
	}

	if (!element.children) {
		return undefined;
	}

	for (const child of element.children.values()) {
		const result = find(child, id);

		if (result) {
			return result;
		}
	}

	return undefined;
}

class Renderer implements ICompressibleTreeRenderer<ExplorerItem, FuzzyScore, HTMLElement> {
	readonly templateId = 'default';
	renderTemplate(container: HTMLElement): HTMLElement {
		return container;
	}
	renderElement(element: ITreeNode<ExplorerItem, FuzzyScore>, index: number, templateData: HTMLElement): void {
		templateData.textContent = element.element.name;
	}
	disposeTemplate(templateData: HTMLElement): void {
		// noop
	}
	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ExplorerItem>, FuzzyScore>, index: number, templateData: HTMLElement): void {
		const result: string[] = [];

		for (const element of node.element.elements) {
			result.push(element.name);
		}

		templateData.textContent = result.join('/');
	}
}

class IdentityProvider implements IIdentityProvider<ExplorerItem> {
	getId(element: ExplorerItem) {
		return {
			toString: () => { return element.name; }
		};
	}
}

class VirtualDelegate implements IListVirtualDelegate<ExplorerItem> {
	getHeight() { return 20; }
	getTemplateId(element: ExplorerItem): string { return 'default'; }
}

class DataSource implements IAsyncDataSource<ExplorerItem, ExplorerItem> {
	hasChildren(element: ExplorerItem): boolean {
		return !!element.children && element.children.size > 0;
	}
	getChildren(element: ExplorerItem): Promise<ExplorerItem[]> {
		return Promise.resolve(Array.from(element.children.values()) || []);
	}
	getParent(element: ExplorerItem): ExplorerItem {
		return element.parent!;
	}

}

class AccessibilityProvider implements IListAccessibilityProvider<ExplorerItem> {
	getWidgetAriaLabel(): string {
		return '';
	}
	getAriaLabel(stat: ExplorerItem): string {
		return stat.name;
	}
}

class KeyboardNavigationLabelProvider implements IKeyboardNavigationLabelProvider<ExplorerItem> {
	getKeyboardNavigationLabel(stat: ExplorerItem): string {
		return stat.name;
	}
	getCompressedNodeKeyboardNavigationLabel(stats: ExplorerItem[]): string {
		return stats.map(stat => stat.name).join('/');
	}
}

class CompressionDelegate implements ITreeCompressionDelegate<ExplorerItem> {
	constructor(private dataSource: DataSource) { }
	isIncompressible(element: ExplorerItem): boolean {
		return !this.dataSource.hasChildren(element);
	}
}

class TestFilesFilter implements ITreeFilter<ExplorerItem> {
	filter(): TreeFilterResult<void> { return true; }
	isIgnored(): boolean { return false; }
	dispose() { }
}

suite('Find Provider - ExplorerView', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const fileService = new TestFileService();
	const configService = new TestConfigurationService();

	function createStat(this: any, path: string, isFolder: boolean): ExplorerItem {
		return new ExplorerItem(URI.from({ scheme: 'file', path }), fileService, configService, NullFilesConfigurationService, undefined, isFolder);
	}

	let root: ExplorerItem;

	let instantiationService: TestInstantiationService;

	const searchMappings = new Map<string, URI[]>([
		['bb', [URI.file('/root/b/bb/bbb.txt'), URI.file('/root/a/ab/abb.txt'), URI.file('/root/b/bb/bba.txt')]],
	]);

	setup(() => {
		root = createStat.call(this, '/root', true);
		const a = createStat.call(this, '/root/a', true);
		const aa = createStat.call(this, '/root/a/aa', true);
		const ab = createStat.call(this, '/root/a/ab', true);
		const aba = createStat.call(this, '/root/a/ab/aba.txt', false);
		const abb = createStat.call(this, '/root/a/ab/abb.txt', false);
		const b = createStat.call(this, '/root/b', true);
		const ba = createStat.call(this, '/root/b/ba', true);
		const baa = createStat.call(this, '/root/b/ba/baa.txt', false);
		const bab = createStat.call(this, '/root/b/ba/bab.txt', false);
		const bb = createStat.call(this, '/root/b/bb', true);

		root.addChild(a);
		a.addChild(aa);
		a.addChild(ab);
		ab.addChild(aba);
		ab.addChild(abb);
		root.addChild(b);
		b.addChild(ba);
		ba.addChild(baa);
		ba.addChild(bab);
		b.addChild(bb);

		instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IExplorerService, {
			roots: [root],
			refresh: () => Promise.resolve(),
			findClosest: (resource: URI) => {
				return find(root, basename(resource)) ?? null;
			},
		});
		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {
				const filePattern = query.filePattern?.replace(/\//g, '')
					.replace(/\*/g, '')
					.replace(/\[/g, '')
					.replace(/\]/g, '')
					.replace(/[A-Z]/g, '') ?? '';
				const fileMatches: IFileMatch[] = (searchMappings.get(filePattern) ?? []).map(u => ({ resource: u }));
				return Promise.resolve({ results: fileMatches, messages: [] });
			},
			schemeHasFileSearchProvider(): boolean {
				return true;
			}
		});
	});

	test('find provider', async function () {
		const disposables = new DisposableStore();

		// Tree Stuff
		const container = document.createElement('div');

		const dataSource = new DataSource();
		const compressionDelegate = new CompressionDelegate(dataSource);
		const keyboardNavigationLabelProvider = new KeyboardNavigationLabelProvider();
		const accessibilityProvider = new AccessibilityProvider();
		const filter = instantiationService.createInstance(TestFilesFilter) as unknown as FilesFilter;

		const options: IWorkbenchCompressibleAsyncDataTreeOptions<ExplorerItem, FuzzyScore> = { identityProvider: new IdentityProvider(), keyboardNavigationLabelProvider, accessibilityProvider };
		const tree = disposables.add(instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree<ExplorerItem | ExplorerItem[], ExplorerItem, FuzzyScore>, 'test', container, new VirtualDelegate(), compressionDelegate, [new Renderer()], dataSource, options));
		tree.layout(200);

		await tree.setInput(root);

		const findProvider = instantiationService.createInstance(ExplorerFindProvider, filter, () => tree);

		findProvider.startSession();

		assert.strictEqual(find(root, 'abb.txt') !== undefined, true);
		assert.strictEqual(find(root, 'bba.txt') !== undefined, false);
		assert.strictEqual(find(root, 'bbb.txt') !== undefined, false);

		assert.strictEqual(find(root, 'abb.txt')?.isMarkedAsFiltered(), false);
		assert.strictEqual(find(root, 'a')?.isMarkedAsFiltered(), false);
		assert.strictEqual(find(root, 'ab')?.isMarkedAsFiltered(), false);

		await findProvider.find('bb', { matchType: TreeFindMatchType.Contiguous, findMode: TreeFindMode.Filter }, new CancellationTokenSource().token);

		assert.strictEqual(find(root, 'abb.txt') !== undefined, true);
		assert.strictEqual(find(root, 'bba.txt') !== undefined, true);
		assert.strictEqual(find(root, 'bbb.txt') !== undefined, true);

		assert.strictEqual(find(root, 'abb.txt')?.isMarkedAsFiltered(), true);
		assert.strictEqual(find(root, 'bba.txt')?.isMarkedAsFiltered(), true);
		assert.strictEqual(find(root, 'bbb.txt')?.isMarkedAsFiltered(), true);

		assert.strictEqual(find(root, 'a')?.isMarkedAsFiltered(), true);
		assert.strictEqual(find(root, 'ab')?.isMarkedAsFiltered(), true);
		assert.strictEqual(find(root, 'b')?.isMarkedAsFiltered(), true);
		assert.strictEqual(find(root, 'bb')?.isMarkedAsFiltered(), true);

		assert.strictEqual(find(root, 'aa')?.isMarkedAsFiltered(), false);
		assert.strictEqual(find(root, 'ba')?.isMarkedAsFiltered(), false);
		assert.strictEqual(find(root, 'aba.txt')?.isMarkedAsFiltered(), false);

		await findProvider.endSession();

		assert.strictEqual(find(root, 'abb.txt') !== undefined, true);
		assert.strictEqual(find(root, 'baa.txt') !== undefined, true);
		assert.strictEqual(find(root, 'baa.txt') !== undefined, true);
		assert.strictEqual(find(root, 'bba.txt') !== undefined, false);
		assert.strictEqual(find(root, 'bbb.txt') !== undefined, false);

		assert.strictEqual(find(root, 'a')?.isMarkedAsFiltered(), false);
		assert.strictEqual(find(root, 'ab')?.isMarkedAsFiltered(), false);
		assert.strictEqual(find(root, 'b')?.isMarkedAsFiltered(), false);
		assert.strictEqual(find(root, 'bb')?.isMarkedAsFiltered(), false);

		disposables.dispose();
	});
});
