/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as editorRange from 'vs/editor/common/core/range';
import { createPrivateApiFor, getPrivateApiFor, IExtHostTestItemApi } from 'vs/workbench/api/common/extHostTestingPrivateApi';
import { TestId, TestIdPathParts } from 'vs/workbench/contrib/testing/common/testId';
import { createTestItemChildren, ExtHostTestItemEvent, ITestChildrenLike, ITestItemApi, ITestItemChildren, TestItemCollection, TestItemEventOp } from 'vs/workbench/contrib/testing/common/testItemCollection';
import { denamespaceTestTag, ITestItem, ITestItemContext } from 'vs/workbench/contrib/testing/common/testTypes';
import type * as vscode from 'vscode';
import * as Convert from 'vs/workbench/api/common/extHostTypeConverters';
import { URI } from 'vs/base/common/uri';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';

const testItemPropAccessor = <K extends keyof vscode.TestItem>(
	api: IExtHostTestItemApi,
	defaultValue: vscode.TestItem[K],
	equals: (a: vscode.TestItem[K], b: vscode.TestItem[K]) => boolean,
	toUpdate: (newValue: vscode.TestItem[K], oldValue: vscode.TestItem[K]) => ExtHostTestItemEvent,
) => {
	let value = defaultValue;
	return {
		enumerable: true,
		configurable: false,
		get() {
			return value;
		},
		set(newValue: vscode.TestItem[K]) {
			if (!equals(value, newValue)) {
				const oldValue = value;
				value = newValue;
				api.listener?.(toUpdate(newValue, oldValue));
			}
		},
	};
};

type WritableProps = Pick<vscode.TestItem, 'range' | 'label' | 'description' | 'sortText' | 'canResolveChildren' | 'busy' | 'error' | 'tags'>;

const strictEqualComparator = <T>(a: T, b: T) => a === b;

const propComparators: { [K in keyof Required<WritableProps>]: (a: vscode.TestItem[K], b: vscode.TestItem[K]) => boolean } = {
	range: (a, b) => {
		if (a === b) { return true; }
		if (!a || !b) { return false; }
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

const evSetProps = <T>(fn: (newValue: T) => Partial<ITestItem>): (newValue: T) => ExtHostTestItemEvent =>
	v => ({ op: TestItemEventOp.SetProp, update: fn(v) });

const makePropDescriptors = (api: IExtHostTestItemApi, label: string): { [K in keyof Required<WritableProps>]: PropertyDescriptor } => ({
	range: testItemPropAccessor<'range'>(api, undefined, propComparators.range, evSetProps(r => ({ range: editorRange.Range.lift(Convert.Range.from(r)) }))),
	label: testItemPropAccessor<'label'>(api, label, propComparators.label, evSetProps(label => ({ label }))),
	description: testItemPropAccessor<'description'>(api, undefined, propComparators.description, evSetProps(description => ({ description }))),
	sortText: testItemPropAccessor<'sortText'>(api, undefined, propComparators.sortText, evSetProps(sortText => ({ sortText }))),
	canResolveChildren: testItemPropAccessor<'canResolveChildren'>(api, false, propComparators.canResolveChildren, state => ({
		op: TestItemEventOp.UpdateCanResolveChildren,
		state,
	})),
	busy: testItemPropAccessor<'busy'>(api, false, propComparators.busy, evSetProps(busy => ({ busy }))),
	error: testItemPropAccessor<'error'>(api, undefined, propComparators.error, evSetProps(error => ({ error: Convert.MarkdownString.fromStrict(error) || null }))),
	tags: testItemPropAccessor<'tags'>(api, [], propComparators.tags, (current, previous) => ({
		op: TestItemEventOp.SetTags,
		new: current.map(Convert.TestTag.from),
		old: previous.map(Convert.TestTag.from),
	})),
});

const toItemFromPlain = (item: ITestItem.Serialized): TestItemImpl => {
	const testId = TestId.fromString(item.extId);
	const testItem = new TestItemImpl(testId.controllerId, testId.localId, item.label, URI.revive(item.uri) || undefined);
	testItem.range = Convert.Range.to(item.range || undefined);
	testItem.description = item.description || undefined;
	testItem.sortText = item.sortText || undefined;
	testItem.tags = item.tags.map(t => Convert.TestTag.to({ id: denamespaceTestTag(t).tagId }));
	return testItem;
};

export const toItemFromContext = (context: ITestItemContext): TestItemImpl => {
	let node: TestItemImpl | undefined;
	for (const test of context.tests) {
		const next = toItemFromPlain(test.item);
		getPrivateApiFor(next).parent = node;
		node = next;
	}

	return node!;
};

export class TestItemImpl implements vscode.TestItem {
	public readonly id!: string;
	public readonly uri!: vscode.Uri | undefined;
	public readonly children!: ITestItemChildren<vscode.TestItem>;
	public readonly parent!: TestItemImpl | undefined;

	public range!: vscode.Range | undefined;
	public description!: string | undefined;
	public sortText!: string | undefined;
	public label!: string;
	public error!: string | vscode.MarkdownString;
	public busy!: boolean;
	public canResolveChildren!: boolean;
	public tags!: readonly vscode.TestTag[];

	/**
	 * Note that data is deprecated and here for back-compat only
	 */
	constructor(controllerId: string, id: string, label: string, uri: vscode.Uri | undefined) {
		if (id.includes(TestIdPathParts.Delimiter)) {
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
	constructor(controllerId: string, label: string) {
		super(controllerId, controllerId, label, undefined);
	}
}

export class ExtHostTestItemCollection extends TestItemCollection<TestItemImpl> {
	constructor(controllerId: string, controllerLabel: string, editors: ExtHostDocumentsAndEditors) {
		super({
			controllerId,
			getDocumentVersion: (uri: URI) => editors.getDocument(uri)?.version,
			getApiFor: getPrivateApiFor as (impl: TestItemImpl) => ITestItemApi<TestItemImpl>,
			getChildren: (item) => item.children as ITestChildrenLike<TestItemImpl>,
			root: new TestItemRootImpl(controllerId, controllerLabel),
			toITestItem: Convert.TestItem.from,
		});
	}
}
