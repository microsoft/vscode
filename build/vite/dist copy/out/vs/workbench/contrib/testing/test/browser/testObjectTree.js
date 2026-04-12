/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ObjectTree } from '../../../../../base/browser/ui/tree/objectTree.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { TestItemTreeElement, TestTreeErrorMessage } from '../../browser/explorerProjections/index.js';
import { MainThreadTestCollection } from '../../common/mainThreadTestCollection.js';
import { testStubs } from '../common/testStubs.js';
const element = document.createElement('div');
element.style.height = '1000px';
element.style.width = '200px';
class TestObjectTree extends ObjectTree {
    constructor(serializer, sorter) {
        super('test', element, {
            getHeight: () => 20,
            getTemplateId: () => 'default'
        }, [
            {
                disposeTemplate: ({ store }) => store.dispose(),
                renderElement: ({ depth, element }, _index, { container, store }) => {
                    const render = () => {
                        container.textContent = `${depth}:${serializer(element)}`;
                        Object.assign(container.dataset, element);
                    };
                    render();
                    if (element instanceof TestItemTreeElement) {
                        store.add(element.onChange(render));
                    }
                },
                disposeElement: (_el, _index, { store }) => store.clear(),
                renderTemplate: container => ({ container, store: new DisposableStore() }),
                templateId: 'default'
            }
        ], {
            sorter: sorter ?? {
                compare: (a, b) => serializer(a).localeCompare(serializer(b))
            }
        });
        this.layout(1000, 200);
    }
    getRendered(getProperty) {
        const elements = element.querySelectorAll('.monaco-tl-contents');
        const sorted = [...elements].sort((a, b) => pos(a) - pos(b));
        const chain = [{ e: '', children: [] }];
        for (const element of sorted) {
            const [depthStr, label] = element.textContent.split(':');
            const depth = Number(depthStr);
            const parent = chain[depth - 1];
            const child = { e: label };
            if (getProperty) {
                child.data = element.dataset[getProperty];
            }
            parent.children = parent.children?.concat(child) ?? [child];
            chain[depth] = child;
        }
        return chain[0].children;
    }
}
const pos = (element) => Number(element.parentElement.parentElement.getAttribute('aria-posinset'));
class ByLabelTreeSorter {
    compare(a, b) {
        if (a instanceof TestTreeErrorMessage || b instanceof TestTreeErrorMessage) {
            return (a instanceof TestTreeErrorMessage ? -1 : 0) + (b instanceof TestTreeErrorMessage ? 1 : 0);
        }
        if (a instanceof TestItemTreeElement && b instanceof TestItemTreeElement && a.test.item.uri && b.test.item.uri && a.test.item.uri.toString() === b.test.item.uri.toString() && a.test.item.range && b.test.item.range) {
            const delta = a.test.item.range.startLineNumber - b.test.item.range.startLineNumber;
            if (delta !== 0) {
                return delta;
            }
        }
        return (a.test.item.sortText || a.test.item.label).localeCompare(b.test.item.sortText || b.test.item.label);
    }
}
// names are hard
export class TestTreeTestHarness extends Disposable {
    constructor(makeTree, c = testStubs.nested()) {
        super();
        this.c = c;
        this.onDiff = this._register(new Emitter());
        this.onFolderChange = this._register(new Emitter());
        this.isProcessingDiff = false;
        this._register(c);
        this._register(this.c.onDidGenerateDiff(d => this.c.setDiff(d /* don't clear during testing */)));
        const collection = new MainThreadTestCollection({ asCanonicalUri: u => u }, (testId, levels) => {
            this.c.expand(testId, levels);
            if (!this.isProcessingDiff) {
                this.onDiff.fire(this.c.collectDiff());
            }
            return Promise.resolve();
        });
        this._register(this.onDiff.event(diff => collection.apply(diff)));
        // eslint-disable-next-line local/code-no-any-casts
        this.projection = this._register(makeTree({
            collection,
            onDidProcessDiff: this.onDiff.event,
        }));
        const sorter = new ByLabelTreeSorter();
        this.tree = this._register(new TestObjectTree(t => 'test' in t ? t.test.item.label : t.message.toString(), sorter));
        this._register(this.tree.onDidChangeCollapseState(evt => {
            if (evt.node.element instanceof TestItemTreeElement) {
                this.projection.expandElement(evt.node.element, evt.deep ? Infinity : 0);
            }
        }));
    }
    pushDiff(...diff) {
        this.onDiff.fire(diff);
    }
    flush() {
        this.isProcessingDiff = true;
        while (this.c.currentDiff.length) {
            this.onDiff.fire(this.c.collectDiff());
        }
        this.isProcessingDiff = false;
        this.projection.applyTo(this.tree);
        return this.tree.getRendered();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdE9iamVjdFRyZWUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL3Rlc3QvYnJvd3Nlci90ZXN0T2JqZWN0VHJlZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDL0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFdEYsT0FBTyxFQUFnRCxtQkFBbUIsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JKLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR3BGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUtuRCxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQzlDLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLFFBQVEsQ0FBQztBQUNoQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUM7QUFFOUIsTUFBTSxjQUFrQixTQUFRLFVBQWtCO0lBQ2pELFlBQVksVUFBK0IsRUFBRSxNQUF1QjtRQUNuRSxLQUFLLENBQ0osTUFBTSxFQUNOLE9BQU8sRUFDUDtZQUNDLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO1lBQ25CLGFBQWEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTO1NBQzlCLEVBQ0Q7WUFDQztnQkFDQyxlQUFlLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFO2dCQUMvQyxhQUFh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