/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITreeNode } from 'vs/base/browser/ui/tree/treeModel';
import { ISpliceable } from 'vs/base/common/sequence';
import { DataTreeModel, IDataTreeProvider, IDataTreeNode, DataTreeNodeState as State } from 'vs/base/browser/ui/tree/dataTreeModel';

function toSpliceable<T>(arr: T[]): ISpliceable<T> {
	return {
		splice(start: number, deleteCount: number, elements: T[]): void {
			arr.splice(start, deleteCount, ...elements);
		}
	};
}

function toArray<T>(list: ITreeNode<IDataTreeNode<T>>[]): [T, State][] {
	return list.map(i => [i.element.element, i.element.state]) as [T, State][];
}

suite('DataTreeModel', function () {

	test('ctor', function () {
		const data = [];
		const list = [] as ITreeNode<IDataTreeNode<number | number[]>>[];
		const dataSource: IDataTreeProvider<number | number[]> = {
			hasChildren(el) {
				return Array.isArray(el);
			},
			getChildren(el) {
				return Promise.resolve((el as number[]).map(element => ({ element })));
			},
			getParent() {
				return Promise.resolve(data);
			}
		};

		const model = new DataTreeModel<number | number[]>(dataSource, toSpliceable(list));
		assert(model);
		assert.equal(list.length, 0);
	});

	test('small tree', async function () {
		const list = [] as ITreeNode<IDataTreeNode<number | number[]>>[];
		const dataSource: IDataTreeProvider<number | number[]> = {
			hasChildren(el) {
				return Array.isArray(el);
			},
			getChildren(el) {
				return Promise.resolve((el as number[]).map(element => ({ element })));
			},
			getParent() {
				return Promise.reject('not implemented');
			}
		};

		const model = new DataTreeModel<number | number[]>(dataSource, toSpliceable(list));
		const data = [0, 1, 2];

		await model.setInput(data);

		assert.deepEqual(list.length, 3);
		assert.deepEqual(toArray(list), [
			[0, State.Idle],
			[1, State.Idle],
			[2, State.Idle]
		]);
	});

	test('small delayed tree', async function () {
		const list = [] as ITreeNode<IDataTreeNode<number | number[]>>[];

		let resolve: Function;
		const dataSource: IDataTreeProvider<number | number[]> = {
			hasChildren(el) {
				return Array.isArray(el);
			},
			getChildren(el) {
				return new Promise(c => {
					resolve = c;
				}).then(() => {
					return (el as number[]).map(element => ({ element }));
				});
			},
			getParent() {
				return Promise.reject('not implemented');
			}
		};

		const model = new DataTreeModel<number | number[]>(dataSource, toSpliceable(list));
		const data = [0, 1, 2];

		const promise = model.setInput(data);
		assert.deepEqual(list.length, 0);

		resolve();
		await promise;
		assert.deepEqual(list.length, 3);
		assert.deepEqual(toArray(list), [
			[0, State.Idle],
			[1, State.Idle],
			[2, State.Idle]
		]);
	});
});