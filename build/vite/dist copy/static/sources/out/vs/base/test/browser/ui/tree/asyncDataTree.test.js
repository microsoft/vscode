/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { AsyncDataTree, CompressibleAsyncDataTree } from '../../../../browser/ui/tree/asyncDataTree.js';
import { timeout } from '../../../../common/async.js';
import { Iterable } from '../../../../common/iterator.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
import { runWithFakedTimers } from '../../../common/timeTravelScheduler.js';
function find(element, id) {
    if (element.id === id) {
        return element;
    }
    if (!element.children) {
        return undefined;
    }
    for (const child of element.children) {
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
        templateData.textContent = element.element.id + (element.element.suffix || '');
    }
    disposeTemplate(templateData) {
        // noop
    }
    renderCompressedElements(node, index, templateData) {
        const result = [];
        for (const element of node.element.elements) {
            result.push(element.id + (element.suffix || ''));
        }
        templateData.textContent = result.join('/');
    }
}
class IdentityProvider {
    getId(element) {
        return element.id;
    }
}
class VirtualDelegate {
    getHeight() { return 20; }
    getTemplateId(element) { return 'default'; }
}
class DataSource {
    hasChildren(element) {
        return !!element.children && element.children.length > 0;
    }
    getChildren(element) {
        return Promise.resolve(element.children || []);
    }
}
class Model {
    constructor(root) {
        this.root = root;
    }
    get(id) {
        const result = find(this.root, id);
        if (!result) {
            throw new Error('element not found');
        }
        return result;
    }
}
suite('AsyncDataTree', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('Collapse state should be preserved across refresh calls', async () => {
        const container = document.createElement('div');
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a'
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 0);
        await tree.setInput(model.root);
        assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);
        const twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie');
        assert(!twistie.classList.contains('collapsible'));
        assert(!twistie.classList.contains('collapsed'));
        model.get('a').children = [
            { id: 'aa' },
            { id: 'ab' },
            { id: 'ac' }
        ];
        await tree.updateChildren(model.root);
        assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);
        await tree.expand(model.get('a'));
        assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 4);
        model.get('a').children = [];
        await tree.updateChildren(model.root);
        assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);
    });
    test('issue #68648', async () => {
        const container = document.createElement('div');
        const getChildrenCalls = [];
        const dataSource = new class {
            hasChildren(element) {
                return !!element.children && element.children.length > 0;
            }
            getChildren(element) {
                getChildrenCalls.push(element.id);
                return Promise.resolve(element.children || []);
            }
        };
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a'
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model.root);
        assert.deepStrictEqual(getChildrenCalls, ['root']);
        let twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie');
        assert(!twistie.classList.contains('collapsible'));
        assert(!twistie.classList.contains('collapsed'));
        assert(tree.getNode().children[0].collapsed);
        model.get('a').children = [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }];
        await tree.updateChildren(model.root);
        assert.deepStrictEqual(getChildrenCalls, ['root', 'root']);
        twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie');
        assert(twistie.classList.contains('collapsible'));
        assert(twistie.classList.contains('collapsed'));
        assert(tree.getNode().children[0].collapsed);
        model.get('a').children = [];
        await tree.updateChildren(model.root);
        assert.deepStrictEqual(getChildrenCalls, ['root', 'root', 'root']);
        twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie');
        assert(!twistie.classList.contains('collapsible'));
        assert(!twistie.classList.contains('collapsed'));
        assert(tree.getNode().children[0].collapsed);
        model.get('a').children = [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }];
        await tree.updateChildren(model.root);
        assert.deepStrictEqual(getChildrenCalls, ['root', 'root', 'root', 'root']);
        twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie');
        assert(twistie.classList.contains('collapsible'));
        assert(twistie.classList.contains('collapsed'));
        assert(tree.getNode().children[0].collapsed);
    });
    test('issue #67722 - once resolved, refreshed collapsed nodes should only get children when expanded', async () => {
        const container = document.createElement('div');
        const getChildrenCalls = [];
        const dataSource = new class {
            hasChildren(element) {
                return !!element.children && element.children.length > 0;
            }
            getChildren(element) {
                getChildrenCalls.push(element.id);
                return Promise.resolve(element.children || []);
            }
        };
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }]
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model.root);
        assert(tree.getNode(model.get('a')).collapsed);
        assert.deepStrictEqual(getChildrenCalls, ['root']);
        await tree.expand(model.get('a'));
        assert(!tree.getNode(model.get('a')).collapsed);
        assert.deepStrictEqual(getChildrenCalls, ['root', 'a']);
        tree.collapse(model.get('a'));
        assert(tree.getNode(model.get('a')).collapsed);
        assert.deepStrictEqual(getChildrenCalls, ['root', 'a']);
        await tree.updateChildren();
        assert(tree.getNode(model.get('a')).collapsed);
        assert.deepStrictEqual(getChildrenCalls, ['root', 'a', 'root'], 'a should not be refreshed, since it\' collapsed');
    });
    test('resolved collapsed nodes which lose children should lose twistie as well', async () => {
        const container = document.createElement('div');
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }]
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model.root);
        await tree.expand(model.get('a'));
        let twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie');
        assert(twistie.classList.contains('collapsible'));
        assert(!twistie.classList.contains('collapsed'));
        assert(!tree.getNode(model.get('a')).collapsed);
        tree.collapse(model.get('a'));
        model.get('a').children = [];
        await tree.updateChildren(model.root);
        twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie');
        assert(!twistie.classList.contains('collapsible'));
        assert(!twistie.classList.contains('collapsed'));
        assert(tree.getNode(model.get('a')).collapsed);
    });
    test('issue #192422 - resolved collapsed nodes with changed children don\'t show old children', async () => {
        const container = document.createElement('div');
        let hasGottenAChildren = false;
        const dataSource = new class {
            hasChildren(element) {
                return !!element.children && element.children.length > 0;
            }
            async getChildren(element) {
                if (element.id === 'a') {
                    if (!hasGottenAChildren) {
                        hasGottenAChildren = true;
                    }
                    else {
                        return [{ id: 'c' }];
                    }
                }
                return element.children || [];
            }
        };
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{ id: 'b' }]
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model.root);
        const a = model.get('a');
        const aNode = tree.getNode(a);
        assert(aNode.collapsed);
        await tree.expand(a);
        assert(!aNode.collapsed);
        assert.equal(aNode.children.length, 1);
        assert.equal(aNode.children[0].element.id, 'b');
        const bChild = container.querySelector('.monaco-list-row:nth-child(2)');
        assert.equal(bChild?.textContent, 'b');
        tree.collapse(a);
        assert(aNode.collapsed);
        await tree.updateChildren(a);
        const aUpdated1 = model.get('a');
        const aNodeUpdated1 = tree.getNode(a);
        assert(aNodeUpdated1.collapsed);
        assert.equal(aNodeUpdated1.children.length, 0);
        let didCheckNoChildren = false;
        const event = tree.onDidChangeCollapseState(e => {
            const child = container.querySelector('.monaco-list-row:nth-child(2)');
            assert.equal(child, null);
            didCheckNoChildren = true;
        });
        await tree.expand(aUpdated1);
        event.dispose();
        assert(didCheckNoChildren);
        const aNodeUpdated2 = tree.getNode(a);
        assert(!aNodeUpdated2.collapsed);
        assert.equal(aNodeUpdated2.children.length, 1);
        assert.equal(aNodeUpdated2.children[0].element.id, 'c');
        const child = container.querySelector('.monaco-list-row:nth-child(2)');
        assert.equal(child?.textContent, 'c');
    });
    test('issue #192422 - resolved collapsed nodes with unchanged children immediately show children', async () => {
        const container = document.createElement('div');
        const dataSource = new class {
            hasChildren(element) {
                return !!element.children && element.children.length > 0;
            }
            async getChildren(element) {
                return element.children || [];
            }
        };
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{ id: 'b' }]
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model.root);
        const a = model.get('a');
        const aNode = tree.getNode(a);
        assert(aNode.collapsed);
        await tree.expand(a);
        assert(!aNode.collapsed);
        assert.equal(aNode.children.length, 1);
        assert.equal(aNode.children[0].element.id, 'b');
        const bChild = container.querySelector('.monaco-list-row:nth-child(2)');
        assert.equal(bChild?.textContent, 'b');
        tree.collapse(a);
        assert(aNode.collapsed);
        const aUpdated1 = model.get('a');
        const aNodeUpdated1 = tree.getNode(a);
        assert(aNodeUpdated1.collapsed);
        assert.equal(aNodeUpdated1.children.length, 1);
        let didCheckSameChildren = false;
        const event = tree.onDidChangeCollapseState(e => {
            const child = container.querySelector('.monaco-list-row:nth-child(2)');
            assert.equal(child?.textContent, 'b');
            didCheckSameChildren = true;
        });
        await tree.expand(aUpdated1);
        event.dispose();
        assert(didCheckSameChildren);
        const aNodeUpdated2 = tree.getNode(a);
        assert(!aNodeUpdated2.collapsed);
        assert.equal(aNodeUpdated2.children.length, 1);
        assert.equal(aNodeUpdated2.children[0].element.id, 'b');
        const child = container.querySelector('.monaco-list-row:nth-child(2)');
        assert.equal(child?.textContent, 'b');
    });
    test('support default collapse state per element', async () => {
        const container = document.createElement('div');
        const getChildrenCalls = [];
        const dataSource = new class {
            hasChildren(element) {
                return !!element.children && element.children.length > 0;
            }
            getChildren(element) {
                getChildrenCalls.push(element.id);
                return Promise.resolve(element.children || []);
            }
        };
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }]
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], dataSource, {
            collapseByDefault: el => el.id !== 'a'
        }));
        tree.layout(200);
        await tree.setInput(model.root);
        assert(!tree.getNode(model.get('a')).collapsed);
        assert.deepStrictEqual(getChildrenCalls, ['root', 'a']);
    });
    test('issue #80098 - concurrent refresh and expand', async () => {
        const container = document.createElement('div');
        const calls = [];
        const dataSource = new class {
            hasChildren(element) {
                return !!element.children && element.children.length > 0;
            }
            getChildren(element) {
                return new Promise(c => calls.push(() => c(element.children || [])));
            }
        };
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{
                            id: 'aa'
                        }]
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        const pSetInput = tree.setInput(model.root);
        calls.pop()(); // resolve getChildren(root)
        await pSetInput;
        const pUpdateChildrenA = tree.updateChildren(model.get('a'));
        const pExpandA = tree.expand(model.get('a'));
        assert.strictEqual(calls.length, 1, 'expand(a) still hasn\'t called getChildren(a)');
        calls.pop()();
        assert.strictEqual(calls.length, 0, 'no pending getChildren calls');
        await pUpdateChildrenA;
        assert.strictEqual(calls.length, 0, 'expand(a) should not have forced a second refresh');
        const result = await pExpandA;
        assert.strictEqual(result, true, 'expand(a) should be done');
    });
    test('issue #80098 - first expand should call getChildren', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            const container = document.createElement('div');
            const calls = [];
            const dataSource = new class {
                hasChildren(element) {
                    return !!element.children && element.children.length > 0;
                }
                getChildren(element) {
                    return new Promise(c => calls.push(() => c(element.children || [])));
                }
            };
            const model = new Model({
                id: 'root',
                children: [{
                        id: 'a', children: [{
                                id: 'aa'
                            }]
                    }]
            });
            const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
            tree.layout(200);
            const pSetInput = tree.setInput(model.root);
            calls.pop()(); // resolve getChildren(root)
            await pSetInput;
            const pExpandA = tree.expand(model.get('a'));
            assert.strictEqual(calls.length, 1, 'expand(a) should\'ve called getChildren(a)');
            let race = await Promise.race([pExpandA.then(() => 'expand'), timeout(1).then(() => 'timeout')]);
            assert.strictEqual(race, 'timeout', 'expand(a) should not be yet done');
            calls.pop()();
            assert.strictEqual(calls.length, 0, 'no pending getChildren calls');
            race = await Promise.race([pExpandA.then(() => 'expand'), timeout(1).then(() => 'timeout')]);
            assert.strictEqual(race, 'expand', 'expand(a) should now be done');
        });
    });
    test('issue #78388 - tree should react to hasChildren toggles', async () => {
        const container = document.createElement('div');
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a'
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model.root);
        assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);
        let twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie');
        assert(!twistie.classList.contains('collapsible'));
        assert(!twistie.classList.contains('collapsed'));
        model.get('a').children = [{ id: 'aa' }];
        await tree.updateChildren(model.get('a'), false);
        assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);
        twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie');
        assert(twistie.classList.contains('collapsible'));
        assert(twistie.classList.contains('collapsed'));
        model.get('a').children = [];
        await tree.updateChildren(model.get('a'), false);
        assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 1);
        twistie = container.querySelector('.monaco-list-row:first-child .monaco-tl-twistie');
        assert(!twistie.classList.contains('collapsible'));
        assert(!twistie.classList.contains('collapsed'));
    });
    test('issues #84569, #82629 - rerender', async () => {
        const container = document.createElement('div');
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a',
                    children: [{
                            id: 'b',
                            suffix: '1'
                        }]
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model.root);
        await tree.expand(model.get('a'));
        assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'b1']);
        const a = model.get('a');
        const b = model.get('b');
        a.children?.splice(0, 1, { id: 'b', suffix: '2' });
        await Promise.all([
            tree.updateChildren(a, true, true),
            tree.updateChildren(b, true, true)
        ]);
        assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'b2']);
    });
    test('issue #199264 - dispose during render', async () => {
        const container = document.createElement('div');
        const model1 = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }]
                }]
        });
        const model2 = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{ id: 'aa' }, { id: 'ab' }, { id: 'ac' }]
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model1.root);
        const input = tree.setInput(model2.root);
        tree.dispose();
        await input;
        assert.strictEqual(container.innerHTML, '');
    });
    test('issue #121567', async () => {
        const container = document.createElement('div');
        const calls = [];
        const dataSource = new class {
            hasChildren(element) {
                return !!element.children && element.children.length > 0;
            }
            async getChildren(element) {
                calls.push(element);
                return element.children ?? Iterable.empty();
            }
        };
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{
                            id: 'aa'
                        }]
                }]
        });
        const a = model.get('a');
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model.root);
        assert.strictEqual(calls.length, 1, 'There should be a single getChildren call for the root');
        assert(tree.isCollapsible(a), 'a is collapsible');
        assert(tree.isCollapsed(a), 'a is collapsed');
        await tree.updateChildren(a, false);
        assert.strictEqual(calls.length, 1, 'There should be no changes to the calls list, since a was collapsed');
        assert(tree.isCollapsible(a), 'a is collapsible');
        assert(tree.isCollapsed(a), 'a is collapsed');
        const children = a.children;
        a.children = [];
        await tree.updateChildren(a, false);
        assert.strictEqual(calls.length, 1, 'There should still be no changes to the calls list, since a was collapsed');
        assert(!tree.isCollapsible(a), 'a is no longer collapsible');
        assert(tree.isCollapsed(a), 'a is collapsed');
        a.children = children;
        await tree.updateChildren(a, false);
        assert.strictEqual(calls.length, 1, 'There should still be no changes to the calls list, since a was collapsed');
        assert(tree.isCollapsible(a), 'a is collapsible again');
        assert(tree.isCollapsed(a), 'a is collapsed');
        await tree.expand(a);
        assert.strictEqual(calls.length, 2, 'Finally, there should be a getChildren call for a');
        assert(tree.isCollapsible(a), 'a is still collapsible');
        assert(!tree.isCollapsed(a), 'a is expanded');
    });
    test('issue #199441', async () => {
        const container = document.createElement('div');
        const dataSource = new class {
            hasChildren(element) {
                return !!element.children && element.children.length > 0;
            }
            async getChildren(element) {
                return element.children ?? Iterable.empty();
            }
        };
        const compressionDelegate = new class {
            isIncompressible(element) {
                return !dataSource.hasChildren(element);
            }
        };
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{
                            id: 'b',
                            children: [{ id: 'b.txt' }]
                        }]
                }]
        });
        const collapseByDefault = (element) => false;
        const tree = store.add(new CompressibleAsyncDataTree('test', container, new VirtualDelegate(), compressionDelegate, [new Renderer()], dataSource, { identityProvider: new IdentityProvider(), collapseByDefault }));
        tree.layout(200);
        await tree.setInput(model.root);
        assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a/b', 'b.txt']);
        model.get('a').children.push({
            id: 'c',
            children: [{ id: 'c.txt' }]
        });
        await tree.updateChildren(model.root, true);
        assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'b', 'b.txt', 'c', 'c.txt']);
    });
    test('Tree Navigation: AsyncDataTree', async () => {
        const container = document.createElement('div');
        const model = new Model({
            id: 'root',
            children: [{
                    id: 'a', children: [{
                            id: 'aa', children: [{ id: 'aa.txt' }]
                        }, {
                            id: 'ab', children: [{ id: 'ab.txt' }]
                        }]
                }, {
                    id: 'b', children: [{
                            id: 'ba', children: [{ id: 'ba.txt' }]
                        }, {
                            id: 'bb', children: [{ id: 'bb.txt' }]
                        }]
                }, {
                    id: 'c', children: [{
                            id: 'ca', children: [{ id: 'ca.txt' }]
                        }, {
                            id: 'cb', children: [{ id: 'cb.txt' }]
                        }]
                }]
        });
        const tree = store.add(new AsyncDataTree('test', container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model.root);
        assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'b', 'c']);
        assert.strictEqual(tree.navigate().current(), null);
        assert.strictEqual(tree.navigate().first()?.id, 'a');
        assert.strictEqual(tree.navigate().last()?.id, 'c');
        assert.strictEqual(tree.navigate(model.get('b')).previous()?.id, 'a');
        assert.strictEqual(tree.navigate(model.get('b')).next()?.id, 'c');
        await tree.expand(model.get('a'));
        await tree.expand(model.get('aa'));
        await tree.expand(model.get('ab'));
        await tree.expand(model.get('b'));
        await tree.expand(model.get('ba'));
        await tree.expand(model.get('bb'));
        await tree.expand(model.get('c'));
        await tree.expand(model.get('ca'));
        await tree.expand(model.get('cb'));
        // Only the first 10 elements are rendered (total height is 200px, each element is 20px)
        assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'aa', 'aa.txt', 'ab', 'ab.txt', 'b', 'ba', 'ba.txt', 'bb', 'bb.txt']);
        assert.strictEqual(tree.navigate().first()?.id, 'a');
        assert.strictEqual(tree.navigate().last()?.id, 'cb.txt');
        assert.strictEqual(tree.navigate(model.get('b')).previous()?.id, 'ab.txt');
        assert.strictEqual(tree.navigate(model.get('b')).next()?.id, 'ba');
        assert.strictEqual(tree.navigate(model.get('ab.txt')).previous()?.id, 'ab');
        assert.strictEqual(tree.navigate(model.get('ab.txt')).next()?.id, 'b');
        assert.strictEqual(tree.navigate(model.get('bb.txt')).next()?.id, 'c');
        tree.collapse(model.get('b'), false);
        assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'aa', 'aa.txt', 'ab', 'ab.txt', 'b', 'c', 'ca', 'ca.txt', 'cb']);
        assert.strictEqual(tree.navigate(model.get('b')).next()?.id, 'c');
    });
    test('Test Navigation: CompressibleAsyncDataTree', async () => {
        const container = document.createElement('div');
        const dataSource = new class {
            hasChildren(element) {
                return !!element.children && element.children.length > 0;
            }
            async getChildren(element) {
                return element.children ?? Iterable.empty();
            }
        };
        const compressionDelegate = new class {
            isIncompressible(element) {
                return !dataSource.hasChildren(element);
            }
        };
        const model = new Model({
            id: 'root',
            children: [
                {
                    id: 'a', children: [{ id: 'aa', children: [{ id: 'aa.txt' }] }]
                }, {
                    id: 'b', children: [{ id: 'ba', children: [{ id: 'ba.txt' }] }]
                }, {
                    id: 'c', children: [{
                            id: 'ca', children: [{ id: 'ca.txt' }]
                        }, {
                            id: 'cb', children: [{ id: 'cb.txt' }]
                        }]
                }
            ]
        });
        const tree = store.add(new CompressibleAsyncDataTree('test', container, new VirtualDelegate(), compressionDelegate, [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
        tree.layout(200);
        await tree.setInput(model.root);
        assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a', 'b', 'c']);
        assert.strictEqual(tree.navigate().current(), null);
        assert.strictEqual(tree.navigate().first()?.id, 'a');
        assert.strictEqual(tree.navigate().last()?.id, 'c');
        assert.strictEqual(tree.navigate(model.get('b')).previous()?.id, 'a');
        assert.strictEqual(tree.navigate(model.get('b')).next()?.id, 'c');
        await tree.expand(model.get('a'));
        await tree.expand(model.get('aa'));
        await tree.expand(model.get('b'));
        await tree.expand(model.get('ba'));
        await tree.expand(model.get('c'));
        await tree.expand(model.get('ca'));
        await tree.expand(model.get('cb'));
        // Only the first 10 elements are rendered (total height is 200px, each element is 20px)
        assert.deepStrictEqual(Array.from(container.querySelectorAll('.monaco-list-row')).map(e => e.textContent), ['a/aa', 'aa.txt', 'b/ba', 'ba.txt', 'c', 'ca', 'ca.txt', 'cb', 'cb.txt']);
        assert.strictEqual(tree.navigate().first()?.id, 'aa');
        assert.strictEqual(tree.navigate().last()?.id, 'cb.txt');
        assert.strictEqual(tree.navigate(model.get('b')).previous()?.id, 'aa.txt');
        assert.strictEqual(tree.navigate(model.get('ba')).previous()?.id, 'aa.txt');
        assert.strictEqual(tree.navigate(model.get('b')).next()?.id, 'ba.txt');
        assert.strictEqual(tree.navigate(model.get('ba')).next()?.id, 'ba.txt');
        assert.strictEqual(tree.navigate(model.get('aa.txt')).previous()?.id, 'aa');
        assert.strictEqual(tree.navigate(model.get('aa.txt')).next()?.id, 'ba');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXN5bmNEYXRhVHJlZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2Jyb3dzZXIvdWkvdHJlZS9hc3luY0RhdGFUcmVlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSxhQUFhLEVBQUUseUJBQXlCLEVBQTRCLE1BQU0sOENBQThDLENBQUM7QUFJbEksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNuRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQVE1RSxTQUFTLElBQUksQ0FBQyxPQUFnQixFQUFFLEVBQVU7SUFDekMsSUFBSSxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFRCxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxLQUFLLE1BQU0sS0FBSyxJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUN0QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRS9CLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWixPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQztBQUVELE1BQU0sUUFBUTtJQUFkO1FBQ1UsZUFBVSxHQUFHLFNBQVMsQ0FBQztJ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QUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXpELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzNFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRW5FLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRXZFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRXZFLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNyQyxNQUFNLENBQUMsZUFBZSxDQUFD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a0JBQWtCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUU1SCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRXBELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRWxFLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbEMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUVuQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFbkMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNsQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ25DLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFbkMsd0ZBQXdGO1FBQ3hGLE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUV0TCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXpELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzNFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTVFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXhFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3pFLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==