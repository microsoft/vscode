/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
import * as editorRange from '../../../editor/common/core/range.js';
import { TestId } from '../../contrib/testing/common/testId.js';
import { createTestItemChildren, TestItemCollection } from '../../contrib/testing/common/testItemCollection.js';
import { denamespaceTestTag } from '../../contrib/testing/common/testTypes.js';
import { createPrivateApiFor, getPrivateApiFor } from './extHostTestingPrivateApi.js';
import * as Convert from './extHostTypeConverters.js';
const testItemPropAccessor = (api, defaultValue, equals, toUpdate) => {
    let value = defaultValue;
    return {
        enumerable: true,
        configurable: false,
        get() {
            return value;
        },
        set(newValue) {
            if (!equals(value, newValue)) {
                const oldValue = value;
                value = newValue;
                api.listener?.(toUpdate(newValue, oldValue));
            }
        },
    };
};
const strictEqualComparator = (a, b) => a === b;
const propComparators = {
    range: (a, b) => {
        if (a === b) {
            return true;
        }
        if (!a || !b) {
            return false;
        }
        return a.isEqual(b);
    },
    label: strictEqualComparator,
    description: strictEqualComparator,
    sortText: strictEqualComparator,
    busy: strictEqualComparator,
    error: strictEqualComparator,
    canResolveChildren: strictEqualComparator,
    tags: (a, b) => {
        if (a.length !== b.length) {
            return false;
        }
        if (a.some(t1 => !b.find(t2 => t1.id === t2.id))) {
            return false;
        }
        return true;
    },
};
const evSetProps = (fn) => v => ({ op: 4 /* TestItemEventOp.SetProp */, update: fn(v) });
const makePropDescriptors = (api, label) => ({
    range: (() => {
        let value;
        const updateProps = evSetProps(r => ({ range: editorRange.Range.lift(Convert.Range.from(r)) }));
        return {
            enumerable: true,
            configurable: false,
            get() {
                return value;
            },
            set(newValue) {
                api.listener?.({ op: 6 /* TestItemEventOp.DocumentSynced */ });
                if (!propComparators.range(value, newValue)) {
                    value = newValue;
                    api.listener?.(updateProps(newValue));
                }
            },
        };
    })(),
    label: testItemPropAccessor(api, label, propComparators.label, evSetProps(label => ({ label }))),
    description: testItemPropAccessor(api, undefined, propComparators.description, evSetProps(description => ({ description }))),
    sortText: testItemPropAccessor(api, undefined, propComparators.sortText, evSetProps(sortText => ({ sortText }))),
    canResolveChildren: testItemPropAccessor(api, false, propComparators.canResolveChildren, state => ({
        op: 2 /* TestItemEventOp.UpdateCanResolveChildren */,
        state,
    })),
    busy: testItemPropAccessor(api, false, propComparators.busy, evSetProps(busy => ({ busy }))),
    error: testItemPropAccessor(api, undefined, propComparators.error, evSetProps(error => ({ error: Convert.MarkdownString.fromStrict(error) || null }))),
    tags: testItemPropAccessor(api, [], propComparators.tags, (current, previous) => ({
        op: 1 /* TestItemEventOp.SetTags */,
        new: current.map(Convert.TestTag.from),
        old: previous.map(Convert.TestTag.from),
    })),
});
const toItemFromPlain = (item) => {
    const testId = TestId.fromString(item.extId);
    const testItem = new TestItemImpl(testId.controllerId, testId.localId, item.label, URI.revive(item.uri) || undefined);
    testItem.range = Convert.Range.to(item.range || undefined);
    testItem.description = item.description || undefined;
    testItem.sortText = item.sortText || undefined;
    testItem.tags = item.tags.map(t => Convert.TestTag.to({ id: denamespaceTestTag(t).tagId }));
    return testItem;
};
export const toItemFromContext = (context) => {
    let node;
    for (const test of context.tests) {
        const next = toItemFromPlain(test.item);
        getPrivateApiFor(next).parent = node;
        node = next;
    }
    return node;
};
export class TestItemImpl {
    /**
     * Note that data is deprecated and here for back-compat only
     */
    constructor(controllerId, id, label, uri) {
        if (id.includes("\0" /* TestIdPathParts.Delimiter */)) {
            throw new Error(`Test IDs may not include the ${JSON.stringify(id)} symbol`);
        }
        const api = createPrivateApiFor(this, controllerId);
        Object.defineProperties(this, {
            id: {
                value: id,
                enumerable: true,
                writable: false,
            },
            uri: {
                value: uri,
                enumerable: true,
                writable: false,
            },
            parent: {
                enumerable: false,
                get() {
                    return api.parent instanceof TestItemRootImpl ? undefined : api.parent;
                },
            },
            children: {
                value: createTestItemChildren(api, getPrivateApiFor, TestItemImpl),
                enumerable: true,
                writable: false,
            },
            ...makePropDescriptors(api, label),
        });
    }
}
export class TestItemRootImpl extends TestItemImpl {
    constructor(controllerId, label) {
        super(controllerId, controllerId, label, undefined);
        this._isRoot = true;
    }
}
export class ExtHostTestItemCollection extends TestItemCollection {
    constructor(controllerId, controllerLabel, editors) {
        super({
            controllerId,
            getDocumentVersion: uri => uri && editors.getDocument(uri)?.version,
            getApiFor: getPrivateApiFor,
            getChildren: (item) => item.children,
            root: new TestItemRootImpl(controllerId, controllerLabel),
            toITestItem: Convert.TestItem.from,
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRlc3RJdGVtLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdFRlc3RJdGVtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEtBQUssV0FBVyxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxNQUFNLEVBQW1CLE1BQU0sd0NBQXdDLENBQUM7QUFDakYsT0FBTyxFQUFFLHNCQUFzQixFQUE0RSxrQkFBa0IsRUFBbUIsTUFBTSxvREFBb0QsQ0FBQztBQUMzTSxPQUFPLEVBQUUsa0JBQWtCLEVBQStCLE1BQU0sMkNBQTJDLENBQUM7QUFFNUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGdCQUFnQixFQUF1QixNQUFNLCtCQUErQixDQUFDO0FBQzNHLE9BQU8sS0FBSyxPQUFPLE1BQU0sNEJBQTRCLENBQUM7QUFFdEQsTUFBTSxvQkFBb0IsR0FBRyxDQUM1QixHQUF3QixFQUN4QixZQUFnQyxFQUNoQyxNQUFpRSxFQUNqRSxRQUE4RixFQUM3RixFQUFFO0lBQ0gsSUFBSSxLQUFLLEdBQUcsWUFBWSxDQUFDO0lBQ3pCLE9BQU87UUFDTixVQUFVLEVBQUUsSUFBSTtRQUNoQixZQUFZLEVBQUUsS0FBSztRQUNuQixHQUFHO1lBQ0YsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsR0FBRyxDQUFDLFFBQTRCO1lBQy9CLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQzlCLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQztnQkFDdkIsS0FBSyxHQUFHLFFBQVEsQ0FBQztnQkFDakIsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxR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