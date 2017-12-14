/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { ExtHostTreeViews } from 'vs/workbench/api/node/extHostTreeViews';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { MainThreadTreeViewsShape, MainContext } from 'vs/workbench/api/node/extHost.protocol';
import { TreeDataProvider, TreeItem } from 'vscode';
import { TestThreadService } from './testThreadService';
import { ExtHostHeapService } from 'vs/workbench/api/node/extHostHeapService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MainThreadCommands } from 'vs/workbench/api/electron-browser/mainThreadCommands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import { TPromise } from 'vs/base/common/winjs.base';
import { TreeItemCollapsibleState, ITreeItem } from 'vs/workbench/common/views';
import { NullLogService } from 'vs/platform/log/common/log';

suite('ExtHostTreeView', function () {

	class RecordingShape extends mock<MainThreadTreeViewsShape>() {

		onRefresh = new Emitter<{ [treeItemHandle: string]: ITreeItem }>();

		$registerView(treeViewId: string): void {
		}

		$refresh(viewId: string, itemsToRefresh?: { [treeItemHandle: string]: ITreeItem }): void {
			this.onRefresh.fire(itemsToRefresh);
		}
	}

	let testObject: ExtHostTreeViews;
	let target: RecordingShape;
	let onDidChangeTreeNode: Emitter<{ key: string }>;
	let onDidChangeTreeKey: Emitter<string>;
	let tree, labels, nodes;

	setup(() => {
		tree = {
			'a': {
				'aa': {},
				'ab': {}
			},
			'b': {
				'ba': {},
				'bb': {}
			}
		};

		labels = {};
		nodes = {};

		let threadService = new TestThreadService();
		// Use IInstantiationService to get typechecking when instantiating
		let inst: IInstantiationService;
		{
			let instantiationService = new TestInstantiationService();
			inst = instantiationService;
		}

		threadService.setTestInstance(MainContext.MainThreadCommands, inst.createInstance(MainThreadCommands, threadService));
		target = new RecordingShape();
		testObject = new ExtHostTreeViews(target, new ExtHostCommands(threadService, new ExtHostHeapService(), new NullLogService()));
		onDidChangeTreeNode = new Emitter<{ key: string }>();
		onDidChangeTreeKey = new Emitter<string>();
		testObject.registerTreeDataProvider('testNodeTreeProvider', aNodeTreeDataProvider());
		testObject.registerTreeDataProvider('testStringTreeProvider', aStringTreeDataProvider());

		testObject.$getElements('testNodeTreeProvider').then(elements => {
			for (const element of elements) {
				testObject.$getChildren('testNodeTreeProvider', element.handle);
			}
		});
	});

	test('construct node tree', () => {
		return testObject.$getElements('testNodeTreeProvider')
			.then(elements => {
				const actuals = elements.map(e => e.handle);
				assert.deepEqual(actuals, ['0/0:a', '0/1:b']);
				return TPromise.join([
					testObject.$getChildren('testNodeTreeProvider', '0/0:a')
						.then(children => {
							const actuals = children.map(e => e.handle);
							assert.deepEqual(actuals, ['0/0:a/0:aa', '0/0:a/1:ab']);
							return TPromise.join([
								testObject.$getChildren('testNodeTreeProvider', '0/0:a/0:aa').then(children => assert.equal(children.length, 0)),
								testObject.$getChildren('testNodeTreeProvider', '0/0:a/1:ab').then(children => assert.equal(children.length, 0))
							]);
						}),
					testObject.$getChildren('testNodeTreeProvider', '0/1:b')
						.then(children => {
							const actuals = children.map(e => e.handle);
							assert.deepEqual(actuals, ['0/1:b/0:ba', '0/1:b/1:bb']);
							return TPromise.join([
								testObject.$getChildren('testNodeTreeProvider', '0/1:b/0:ba').then(children => assert.equal(children.length, 0)),
								testObject.$getChildren('testNodeTreeProvider', '0/1:b/1:bb').then(children => assert.equal(children.length, 0))
							]);
						})
				]);
			});
	});

	test('construct string tree', () => {
		return testObject.$getElements('testStringTreeProvider')
			.then(elements => {
				const actuals = elements.map(e => e.handle);
				assert.deepEqual(actuals, ['a', 'b']);
				return TPromise.join([
					testObject.$getChildren('testStringTreeProvider', 'a')
						.then(children => {
							const actuals = children.map(e => e.handle);
							assert.deepEqual(actuals, ['aa', 'ab']);
							return TPromise.join([
								testObject.$getChildren('testStringTreeProvider', 'aa').then(children => assert.equal(children.length, 0)),
								testObject.$getChildren('testStringTreeProvider', 'ab').then(children => assert.equal(children.length, 0))
							]);
						}),
					testObject.$getChildren('testStringTreeProvider', 'b')
						.then(children => {
							const actuals = children.map(e => e.handle);
							assert.deepEqual(actuals, ['ba', 'bb']);
							return TPromise.join([
								testObject.$getChildren('testStringTreeProvider', 'ba').then(children => assert.equal(children.length, 0)),
								testObject.$getChildren('testStringTreeProvider', 'bb').then(children => assert.equal(children.length, 0))
							]);
						})
				]);
			});
	});

	test('refresh root', function (done) {
		target.onRefresh.event(actuals => {
			assert.equal(undefined, actuals);
			done();
		});
		onDidChangeTreeNode.fire();
	});

	test('refresh a parent node', () => {
		return new TPromise((c, e) => {
			target.onRefresh.event(actuals => {
				assert.deepEqual(['0/1:b'], Object.keys(actuals));
				assert.deepEqual(removeUnsetKeys(actuals['0/1:b']), {
					handle: '0/1:b',
					label: 'b',
				});
				c(null);
			});
			onDidChangeTreeNode.fire(getNode('b'));
		});
	});

	test('refresh a leaf node', function (done) {
		target.onRefresh.event(actuals => {
			assert.deepEqual(['0/1:b/1:bb'], Object.keys(actuals));
			assert.deepEqual(removeUnsetKeys(actuals['0/1:b/1:bb']), {
				handle: '0/1:b/1:bb',
				parentHandle: '0/1:b',
				label: 'bb'
			});
			done();
		});
		onDidChangeTreeNode.fire(getNode('bb'));
	});

	test('refresh parent and child node trigger refresh only on parent - scenario 1', function (done) {
		target.onRefresh.event(actuals => {
			assert.deepEqual(['0/1:b', '0/0:a/0:aa'], Object.keys(actuals));
			assert.deepEqual(removeUnsetKeys(actuals['0/1:b']), {
				handle: '0/1:b',
				label: 'b',
			});
			assert.deepEqual(removeUnsetKeys(actuals['0/0:a/0:aa']), {
				handle: '0/0:a/0:aa',
				parentHandle: '0/0:a',
				label: 'aa',
			});
			done();
		});
		onDidChangeTreeNode.fire(getNode('b'));
		onDidChangeTreeNode.fire(getNode('aa'));
		onDidChangeTreeNode.fire(getNode('bb'));
	});

	test('refresh parent and child node trigger refresh only on parent - scenario 2', function (done) {
		target.onRefresh.event(actuals => {
			assert.deepEqual(['0/0:a/0:aa', '0/1:b'], Object.keys(actuals));
			assert.deepEqual(removeUnsetKeys(actuals['0/1:b']), {
				handle: '0/1:b',
				label: 'b',
			});
			assert.deepEqual(removeUnsetKeys(actuals['0/0:a/0:aa']), {
				handle: '0/0:a/0:aa',
				parentHandle: '0/0:a',
				label: 'aa',
			});
			done();
		});
		onDidChangeTreeNode.fire(getNode('bb'));
		onDidChangeTreeNode.fire(getNode('aa'));
		onDidChangeTreeNode.fire(getNode('b'));
	});

	test('refresh an element for label change', function (done) {
		labels['a'] = 'aa';
		target.onRefresh.event(actuals => {
			assert.deepEqual(['0/0:a'], Object.keys(actuals));
			assert.deepEqual(removeUnsetKeys(actuals['0/0:a']), {
				handle: '0/0:aa',
				label: 'aa',
			});
			done();
		});
		onDidChangeTreeNode.fire(getNode('a'));
	});

	test('refresh calls are throttled on roots', function (done) {
		target.onRefresh.event(actuals => {
			assert.equal(undefined, actuals);
			done();
		});
		onDidChangeTreeNode.fire();
		onDidChangeTreeNode.fire();
		onDidChangeTreeNode.fire();
		onDidChangeTreeNode.fire();
	});

	test('refresh calls are throttled on elements', function (done) {
		target.onRefresh.event(actuals => {
			assert.deepEqual(['0/0:a', '0/1:b'], Object.keys(actuals));
			done();
		});

		onDidChangeTreeNode.fire(getNode('a'));
		onDidChangeTreeNode.fire(getNode('b'));
		onDidChangeTreeNode.fire(getNode('b'));
		onDidChangeTreeNode.fire(getNode('a'));
	});

	test('refresh calls are throttled on unknown elements', function (done) {
		target.onRefresh.event(actuals => {
			assert.deepEqual(['0/0:a', '0/1:b'], Object.keys(actuals));
			done();
		});

		onDidChangeTreeNode.fire(getNode('a'));
		onDidChangeTreeNode.fire(getNode('b'));
		onDidChangeTreeNode.fire(getNode('g'));
		onDidChangeTreeNode.fire(getNode('a'));
	});

	test('refresh calls are throttled on unknown elements and root', function (done) {
		target.onRefresh.event(actuals => {
			assert.equal(undefined, actuals);
			done();
		});

		onDidChangeTreeNode.fire(getNode('a'));
		onDidChangeTreeNode.fire(getNode('b'));
		onDidChangeTreeNode.fire(getNode('g'));
		onDidChangeTreeNode.fire();
	});

	test('refresh calls are throttled on elements and root', function (done) {
		target.onRefresh.event(actuals => {
			assert.equal(undefined, actuals);
			done();
		});

		onDidChangeTreeNode.fire(getNode('a'));
		onDidChangeTreeNode.fire(getNode('b'));
		onDidChangeTreeNode.fire();
		onDidChangeTreeNode.fire(getNode('a'));
	});

	test('generate unique handles from labels by escaping them', () => {
		tree = {
			'a/0:b': {}
		};

		onDidChangeTreeNode.fire();

		return testObject.$getElements('testNodeTreeProvider')
			.then(elements => {
				assert.deepEqual(elements.map(e => e.handle), ['0/0:a//0:b']);
			});
	});

	function removeUnsetKeys(obj: any): any {
		const result = {};
		for (const key of Object.keys(obj)) {
			if (obj[key] !== void 0) {
				result[key] = obj[key];
			}
		}
		return result;
	}

	function aNodeTreeDataProvider(): TreeDataProvider<{ key: string }> {
		return {
			getChildren: (element: { key: string }): { key: string }[] => {
				return getChildren(element ? element.key : undefined).map(key => getNode(key));
			},
			getTreeItem: (element: { key: string }): TreeItem => {
				return getTreeItem(element.key);
			},
			onDidChangeTreeData: onDidChangeTreeNode.event
		};
	}

	function aStringTreeDataProvider(): TreeDataProvider<string> {
		return {
			getChildren: (element: string): string[] => {
				return getChildren(element);
			},
			getTreeItem: (element: string): TreeItem => {
				return getTreeItem(element);
			},
			onDidChangeTreeData: onDidChangeTreeKey.event
		};
	}

	function getTreeElement(element): any {
		let parent = tree;
		for (let i = 0; i < element.length; i++) {
			parent = parent[element.substring(0, i + 1)];
			if (!parent) {
				return null;
			}
		}
		return parent;
	}

	function getChildren(key: string): string[] {
		if (!key) {
			return Object.keys(tree);
		}
		let treeElement = getTreeElement(key);
		if (treeElement) {
			const children = Object.keys(treeElement);
			const collapsibleStateIndex = children.indexOf('collapsibleState');
			if (collapsibleStateIndex !== -1) {
				children.splice(collapsibleStateIndex, 1);
			}
			return children;
		}
		return [];
	}

	function getTreeItem(key: string): TreeItem {
		const treeElement = getTreeElement(key);
		return {
			label: labels[key] || key,
			collapsibleState: treeElement ? treeElement['collapsibleState'] : TreeItemCollapsibleState.Collapsed
		};
	}

	function getNode(key: string): { key: string } {
		if (!nodes[key]) {
			nodes[key] = { key };
		}
		return nodes[key];
	}

});
