/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CompressibleObjectTree, ObjectTree } from '../../../../browser/ui/tree/objectTree.js';
import { runWithFakedTimers } from '../../../common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
function getRowsTextContent(container) {
    const rows = [...container.querySelectorAll('.monaco-list-row')];
    rows.sort((a, b) => parseInt(a.getAttribute('data-index')) - parseInt(b.getAttribute('data-index')));
    return rows.map(row => row.querySelector('.monaco-tl-contents').textContent);
}
function clickElement(element, ctrlKey = false) {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ctrlKey, button: 0 }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey, button: 0 }));
}
function dispatchKeydown(element, key, code, keyCode) {
    const keyboardEvent = new KeyboardEvent('keydown', { bubbles: true, key, code });
    Object.defineProperty(keyboardEvent, 'keyCode', { get: () => keyCode });
    element.dispatchEvent(keyboardEvent);
}
suite('ObjectTree', function () {
    suite('TreeNavigator', function () {
        let tree;
        let filter = (_) => true;
        teardown(() => {
            tree.dispose();
            filter = (_) => true;
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        setup(() => {
            const container = document.createElement('div');
            container.style.width = '200px';
            container.style.height = '200px';
            const delegate = new class {
                getHeight() { return 20; }
                getTemplateId() { return 'default'; }
            };
            const renderer = new class {
                constructor() {
                    this.templateId = 'default';
                }
                renderTemplate(container) {
                    return container;
                }
                renderElement(element, index, templateData) {
                    templateData.textContent = `${element.element}`;
                }
                disposeTemplate() { }
            };
            tree = new ObjectTree('test', container, delegate, [renderer], { filter: { filter: (el) => filter(el) } });
            tree.layout(200);
        });
        test('should be able to navigate', () => {
            tree.setChildren(null, [
                {
                    element: 0, children: [
                        { element: 10 },
                        { element: 11 },
                        { element: 12 },
                    ]
                },
                { element: 1 },
                { element: 2 }
            ]);
            const navigator = tree.navigate();
            assert.strictEqual(navigator.current(), null);
            assert.strictEqual(navigator.next(), 0);
            assert.strictEqual(navigator.current(), 0);
            assert.strictEqual(navigator.next(), 10);
            assert.strictEqual(navigator.current(), 10);
            assert.strictEqual(navigator.next(), 11);
            assert.strictEqual(navigator.current(), 11);
            assert.strictEqual(navigator.next(), 12);
            assert.strictEqual(navigator.current(), 12);
            assert.strictEqual(navigator.next(), 1);
            assert.strictEqual(navigator.current(), 1);
            assert.strictEqual(navigator.next(), 2);
            assert.strictEqual(navigator.current(), 2);
            assert.strictEqual(navigator.previous(), 1);
            assert.strictEqual(navigator.current(), 1);
            assert.strictEqual(navigator.previous(), 12);
            assert.strictEqual(navigator.previous(), 11);
            assert.strictEqual(navigator.previous(), 10);
            assert.strictEqual(navigator.previous(), 0);
            assert.strictEqual(navigator.previous(), null);
            assert.strictEqual(navigator.next(), 0);
            assert.strictEqual(navigator.next(), 10);
            assert.strictEqual(navigator.first(), 0);
            assert.strictEqual(navigator.last(), 2);
        });
        test('should skip collapsed nodes', () => {
            tree.setChildren(null, [
                {
                    element: 0, collapsed: true, children: [
                        { element: 10 },
                        { element: 11 },
                        { element: 12 },
                    ]
                },
                { element: 1 },
                { element: 2 }
            ]);
            const navigator = tree.navigate();
            assert.strictEqual(navigator.current(), null);
            assert.strictEqual(navigator.next(), 0);
            assert.strictEqual(navigator.next(), 1);
            assert.strictEqual(navigator.next(), 2);
            assert.strictEqual(navigator.next(), null);
            assert.strictEqual(navigator.previous(), 2);
            assert.strictEqual(navigator.previous(), 1);
            assert.strictEqual(navigator.previous(), 0);
            assert.strictEqual(navigator.previous(), null);
            assert.strictEqual(navigator.next(), 0);
            assert.strictEqual(navigator.first(), 0);
            assert.strictEqual(navigator.last(), 2);
        });
        test('should skip filtered elements', () => {
            filter = el => el % 2 === 0;
            tree.setChildren(null, [
                {
                    element: 0, children: [
                        { element: 10 },
                        { element: 11 },
                        { element: 12 },
                    ]
                },
                { element: 1 },
                { element: 2 }
            ]);
            const navigator = tree.navigate();
            assert.strictEqual(navigator.current(), null);
            assert.strictEqual(navigator.next(), 0);
            assert.strictEqual(navigator.next(), 10);
            assert.strictEqual(navigator.next(), 12);
            assert.strictEqual(navigator.next(), 2);
            assert.strictEqual(navigator.next(), null);
            assert.strictEqual(navigator.previous(), 2);
            assert.strictEqual(navigator.previous(), 12);
            assert.strictEqual(navigator.previous(), 10);
            assert.strictEqual(navigator.previous(), 0);
            assert.strictEqual(navigator.previous(), null);
            assert.strictEqual(navigator.next(), 0);
            assert.strictEqual(navigator.next(), 10);
            assert.strictEqual(navigator.first(), 0);
            assert.strictEqual(navigator.last(), 2);
        });
        test('should be able to start from node', () => {
            tree.setChildren(null, [
                {
                    element: 0, children: [
                        { element: 10 },
                        { element: 11 },
                        { element: 12 },
                    ]
                },
                { element: 1 },
                { element: 2 }
            ]);
            const navigator = tree.navigate(1);
            assert.strictEqual(navigator.current(), 1);
            assert.strictEqual(navigator.next(), 2);
            assert.strictEqual(navigator.current(), 2);
            assert.strictEqual(navigator.previous(), 1);
            assert.strictEqual(navigator.current(), 1);
            assert.strictEqual(navigator.previous(), 12);
            assert.strictEqual(navigator.previous(), 11);
            assert.strictEqual(navigator.previous(), 10);
            assert.strictEqual(navigator.previous(), 0);
            assert.strictEqual(navigator.previous(), null);
            assert.strictEqual(navigator.next(), 0);
            assert.strictEqual(navigator.next(), 10);
            assert.strictEqual(navigator.first(), 0);
            assert.strictEqual(navigator.last(), 2);
        });
    });
    class Delegate {
        getHeight() { return 20; }
        getTemplateId() { return 'default'; }
    }
    class Renderer {
        constructor() {
            this.templateId = 'default';
        }
        renderTemplate(container) {
            return container;
        }
        renderElement(element, index, templateData) {
            templateData.textContent = `${element.element}`;
        }
        disposeTemplate() { }
    }
    class IdentityProvider {
        getId(element) {
            return `${element % 100}`;
        }
    }
    test('traits are preserved according to string identity', function () {
        const container = document.createElement('div');
        container.style.width = '200px';
        container.style.height = '200px';
        const delegate = new Delegate();
        const renderer = new Renderer();
        const identityProvider = new IdentityProvider();
        const tree = new ObjectTree('test', container, delegate, [renderer], { identityProvider });
        tree.layout(200);
        tree.setChildren(null, [{ element: 0 }, { element: 1 }, { element: 2 }, { element: 3 }]);
        tree.setFocus([1]);
        assert.deepStrictEqual(tree.getFocus(), [1]);
        tree.setChildren(null, [{ element: 100 }, { element: 101 }, { element: 102 }, { element: 103 }]);
        assert.deepStrictEqual(tree.getFocus(), [101]);
    });
    test('updateOptions preserves wrapped identity provider in view options', function () {
        const container = document.createElement('div');
        container.style.width = '200px';
        container.style.height = '200px';
        const delegate = new Delegate();
        const renderer = new Renderer();
        const identityProvider = {
            getId(element) {
                return `${element}`;
            },
            getGroupId(element) {
                return element % 2;
            }
        };
        const tree = new ObjectTree('test', container, delegate, [renderer], { identityProvider });
        try {
            tree.layout(200);
            tree.setChildren(null, [{ element: 0 }, { element: 1 }, { element: 2 }, { element: 3 }]);
            const firstRow = container.querySelector('.monaco-list-row[data-index="0"]');
            const secondRow = container.querySelector('.monaco-list-row[data-index="1"]');
            clickElement(firstRow);
            assert.deepStrictEqual(tree.getSelection(), [0]);
            tree.updateOptions({ indent: 12 });
            clickElement(secondRow, true);
            assert.deepStrictEqual(tree.getSelection(), [1]);
        }
        finally {
            tree.dispose();
        }
    });
    test('updateOptions preserves wrapped accessibility provider for type navigation re-announce', async function () {
        const container = document.createElement('div');
        container.style.width = '200px';
        container.style.height = '200px';
        const delegate = new Delegate();
        const renderer = new Renderer();
        const accessibilityProvider = {
            getAriaLabel(element) {
                assert.strictEqual(typeof element, 'number');
                return `aria ${element}`;
            },
            getWidgetAriaLabel() {
                return 'tree';
            }
        };
        const tree = new ObjectTree('test', container, delegate, [renderer], {
            accessibilityProvider,
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: () => 'a'
            }
        });
        try {
            await runWithFakedTimers({ useFakeTimers: true }, async () => {
                tree.layout(200);
                tree.setChildren(null, [{ element: 0 }]);
                tree.setFocus([0]);
                tree.domFocus();
                tree.updateOptions({ indent: 12 });
                dispatchKeydown(tree.getHTMLElement(), 'a', 'KeyA', 65);
                await Promise.resolve();
            });
        }
        finally {
            tree.dispose();
        }
    });
});
suite('CompressibleObjectTree', function () {
    class Delegate {
        getHeight() { return 20; }
        getTemplateId() { return 'default'; }
    }
    class Renderer {
        constructor() {
            this.templateId = 'default';
        }
        renderTemplate(container) {
            return container;
        }
        renderElement(node, _, templateData) {
            templateData.textContent = `${node.element}`;
        }
        renderCompressedElements(node, _, templateData) {
            templateData.textContent = `${node.element.elements.join('/')}`;
        }
        disposeTemplate() { }
    }
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    test('empty', function () {
        const container = document.createElement('div');
        container.style.width = '200px';
        container.style.height = '200px';
        const tree = ds.add(new CompressibleObjectTree('test', container, new Delegate(), [new Renderer()]));
        tree.layout(200);
        assert.strictEqual(getRowsTextContent(container).length, 0);
    });
    test('simple', function () {
        const container = document.createElement('div');
        container.style.width = '200px';
        container.style.height = '200px';
        const tree = ds.add(new CompressibleObjectTree('test', container, new Delegate(), [new Renderer()]));
        tree.layout(200);
        tree.setChildren(null, [
            {
                element: 0, children: [
                    { element: 10 },
                    { element: 11 },
                    { element: 12 },
                ]
            },
            { element: 1 },
            { element: 2 }
        ]);
        assert.deepStrictEqual(getRowsTextContent(container), ['0', '10', '11', '12', '1', '2']);
    });
    test('compressed', () => {
        const container = document.createElement('div');
        container.style.width = '200px';
        container.style.height = '200px';
        const tree = ds.add(new CompressibleObjectTree('test', container, new Delegate(), [new Renderer()]));
        tree.layout(200);
        tree.setChildren(null, [
            {
                element: 1, children: [{
                        element: 11, children: [{
                                element: 111, children: [
                                    { element: 1111 },
                                    { element: 1112 },
                                    { element: 1113 },
                                ]
                            }]
                    }]
            }
        ]);
        assert.deepStrictEqual(getRowsTextContent(container), ['1/11/111', '1111', '1112', '1113']);
        tree.setChildren(11, [
            { element: 111 },
            { element: 112 },
            { element: 113 },
        ]);
        assert.deepStrictEqual(getRowsTextContent(container), ['1/11', '111', '112', '113']);
        tree.setChildren(113, [
            { element: 1131 }
        ]);
        assert.deepStrictEqual(getRowsTextContent(container), ['1/11', '111', '112', '113/1131']);
        tree.setChildren(1131, [
            { element: 1132 }
        ]);
        assert.deepStrictEqual(getRowsTextContent(container), ['1/11', '111', '112', '113/1131/1132']);
        tree.setChildren(1131, [
            { element: 1132 },
            { element: 1133 },
        ]);
        assert.deepStrictEqual(getRowsTextContent(container), ['1/11', '111', '112', '113/1131', '1132', '1133']);
    });
    test('enableCompression', () => {
        const container = document.createElement('div');
        container.style.width = '200px';
        container.style.height = '200px';
        const tree = ds.add(new CompressibleObjectTree('test', container, new Delegate(), [new Renderer()]));
        tree.layout(200);
        tree.setChildren(null, [
            {
                element: 1, children: [{
                        element: 11, children: [{
                                element: 111, children: [
                                    { element: 1111 },
                                    { element: 1112 },
                                    { element: 1113 },
                                ]
                            }]
                    }]
            }
        ]);
        assert.deepStrictEqual(getRowsTextContent(container), ['1/11/111', '1111', '1112', '1113']);
        tree.updateOptions({ compressionEnabled: false });
        assert.deepStrictEqual(getRowsTextContent(container), ['1', '11', '111', '1111', '1112', '1113']);
        tree.updateOptions({ compressionEnabled: true });
        assert.deepStrictEqual(getRowsTextContent(container), ['1/11/111', '1111', '1112', '1113']);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JqZWN0VHJlZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRzVCLE9BQU8sRUFBRSxzQkFBc0IsRUFBNkIsVUFBVSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFMUgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFbkYsU0FBUyxrQkFBa0IsQ0FBQyxTQUFzQjtJQUNqRCxNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztJQUNqRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFFLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdkcsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsQ0FBRSxDQUFDLFdBQVksQ0FBQyxDQUFDO0FBQ2hGLENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxPQUFvQixFQUFFLE9BQU8sR0FBRyxLQUFLO0lBQzFELE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxVQUFVLENBQUMsV0FBVyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENB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RSxPQUFPLEVBQUUsQ0FBQyxFQUFFO2FBQ2QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBRWxDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMs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O2lCQUNEO2dCQUNELEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRTtnQkFDZCxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUU7YUFDZCxDQUFDLENBQUM7WUFFSCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRW5DLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFD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