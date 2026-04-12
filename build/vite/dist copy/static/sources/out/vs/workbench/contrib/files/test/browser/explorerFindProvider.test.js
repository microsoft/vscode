/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { TreeFindMatchType, TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { ISearchService } from '../../../../services/search/common/search.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { IExplorerService } from '../../browser/files.js';
import { ExplorerFindProvider } from '../../browser/views/explorerViewer.js';
import { ExplorerItem } from '../../common/explorerModel.js';
function find(element, id) {
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
class Renderer {
    constructor() {
        this.templateId = 'default';
    }
    renderTemplate(container) {
        return container;
    }
    renderElement(element, index, templateData) {
        templateData.textContent = element.element.name;
    }
    disposeTemplate(templateData) {
        // noop
    }
    renderCompressedElements(node, index, templateData) {
        const result = [];
        for (const element of node.element.elements) {
            result.push(element.name);
        }
        templateData.textContent = result.join('/');
    }
}
class IdentityProvider {
    getId(element) {
        return {
            toString: () => { return element.name; }
        };
    }
}
class VirtualDelegate {
    getHeight() { return 20; }
    getTemplateId(element) { return 'default'; }
}
class DataSource {
    hasChildren(element) {
        return !!element.children && element.children.size > 0;
    }
    getChildren(element) {
        return Promise.resolve(Array.from(element.children.values()) || []);
    }
    getParent(element) {
        return element.parent;
    }
}
class AccessibilityProvider {
    getWidgetAriaLabel() {
        return '';
    }
    getAriaLabel(stat) {
        return stat.name;
    }
}
class KeyboardNavigationLabelProvider {
    getKeyboardNavigationLabel(stat) {
        return stat.name;
    }
    getCompressedNodeKeyboardNavigationLabel(stats) {
        return stats.map(stat => stat.name).join('/');
    }
}
class CompressionDelegate {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    isIncompressible(element) {
        return !this.dataSource.hasChildren(element);
    }
}
class TestFilesFilter {
    filter() { return true; }
    isIgnored() { return false; }
    dispose() { }
}
suite('Find Provider - ExplorerView', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    const fileService = new TestFileService();
    const configService = new TestConfigurationService();
    function createStat(path, isFolder) {
        return new ExplorerItem(URI.from({ scheme: 'file', path }), fileService, configService, NullFilesConfigurationService, undefined, isFolder);
    }
    let root;
    let instantiationService;
    const searchMappings = new Map([
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
            findClosest: (resource) => {
                return find(root, basename(resource)) ?? null;
            },
        });
        instantiationService.stub(ISearchService, {
            fileSearch(query, token) {
                const filePattern = query.filePattern?.replace(/\//g, '')
                    .replace(/\*/g, '')
                    .replace(/\[/g, '')
                    .replace(/\]/g, '')
                    .replace(/[A-Z]/g, '') ?? '';
                const fileMatches = (searchMappings.get(filePattern) ?? []).map(u => ({ resource: u }));
                return Promise.resolve({ results: fileMatches, messages: [] });
            },
            schemeHasFileSearchProvider() {
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
        const filter = instantiationService.createInstance(TestFilesFilter);
        const options = { identityProvider: new IdentityProvider(), keyboardNavigationLabelProvider, accessibilityProvider };
        const tree = disposables.add(instantiationService.createInstance((WorkbenchCompressibleAsyncDataTree), 'test', container, new VirtualDelegate(), compressionDelegate, [new Renderer()], dataSource, options));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwbG9yZXJGaW5kUHJvdmlkZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL3Rlc3QvYnJvd3Nlci9leHBsb3JlckZpbmRQcm92aWRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUc1QixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFLdEcsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBRXpILE9BQU8sRUFBOEMsa0NBQWtDLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNySixPQUFPLEVBQTJDLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3ZILE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsSCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUMxRCxPQUFPLEVBQUUsb0JBQW9CLEVBQWUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0JBQStCLENBQUM7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SyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFbEUsTUFBTSxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxVQUFVLEVBQUUsUUFBUSxFQUFFLFlBQVksQ0FBQyxNQUFNLEVBQUUsRUFBRSxJQUFJLHVCQUF1QixFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFL0ksTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxLQUFLLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLEtBQUssU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsS0FBSyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFOUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFdkUsTUFBTSxZQUFZLENBQUMsVUFBVSxFQUFFLENBQUM7UUFFaEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxLQUFLLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLEtBQUssU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsS0FBSyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDOUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxLQUFLLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMvRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLEtBQUssU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRS9ELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxrQkFBa0IsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxrQkFBa0IsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxrQkFBa0IsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxrQkFBa0IsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRWxFLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN2QixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=