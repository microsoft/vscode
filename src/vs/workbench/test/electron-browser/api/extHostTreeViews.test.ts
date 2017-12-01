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
import { NoopLogService } from 'vs/platform/log/common/log';
import { TPromise } from 'vs/base/common/winjs.base';
import { TreeItemCollapsibleState } from 'vs/workbench/common/views';

suite('ExtHostTreeView', function () {


	class RecordingShape extends mock<MainThreadTreeViewsShape>() {

		onRefresh = new Emitter<string[]>();

		$registerView(treeViewId: string): void {
		}

		$refresh(viewId: string, itemHandles: string[]): void {
			this.onRefresh.fire(itemHandles);
		}
	}

	let testObject: ExtHostTreeViews;
	let target: RecordingShape;
	let onDidChangeTreeData: Emitter<string>;
	let tree = {
		'a': {
			'aa': {},
			'ab': {}
		},
		'b': {
			'ba': {},
			'bb': {}
		}
	};

	setup(() => {
		let threadService = new TestThreadService();
		// Use IInstantiationService to get typechecking when instantiating
		let inst: IInstantiationService;
		{
			let instantiationService = new TestInstantiationService();
			inst = instantiationService;
		}

		threadService.setTestInstance(MainContext.MainThreadCommands, inst.createInstance(MainThreadCommands, threadService));
		target = new RecordingShape();
		testObject = new ExtHostTreeViews(target, new ExtHostCommands(threadService, new ExtHostHeapService(), new NoopLogService()));
		onDidChangeTreeData = new Emitter<string>();
		testObject.registerTreeDataProvider('testDataProvider', aTreeDataProvider());

		testObject.$getElements('testDataProvider').then(elements => {
			for (const element of elements) {
				testObject.$getChildren('testDataProvider', element.handle);
			}
		});
	});

	test('construct tree', () => {
		return testObject.$getElements('testDataProvider')
			.then(elements => {
				const actuals = elements.map(e => e.handle);
				assert.deepEqual(actuals, ['0/0:a', '0/1:b']);
				return TPromise.join([
					testObject.$getChildren('testDataProvider', '0/0:a')
						.then(children => {
							const actuals = children.map(e => e.handle);
							assert.deepEqual(actuals, ['0/0:a/0:aa', '0/0:a/1:ab']);
							return TPromise.join([
								testObject.$getChildren('testDataProvider', '0/0:a/0:aa').then(children => assert.equal(children.length, 0)),
								testObject.$getChildren('testDataProvider', '0/0:a/1:ab').then(children => assert.equal(children.length, 0))
							]);
						}),
					testObject.$getChildren('testDataProvider', '0/1:b')
						.then(children => {
							const actuals = children.map(e => e.handle);
							assert.deepEqual(actuals, ['0/1:b/0:ba', '0/1:b/1:bb']);
							return TPromise.join([
								testObject.$getChildren('testDataProvider', '0/1:b/0:ba').then(children => assert.equal(children.length, 0)),
								testObject.$getChildren('testDataProvider', '0/1:b/1:bb').then(children => assert.equal(children.length, 0))
							]);
						})
				]);
			});
	});

	test('children are fetched immediately if state is expanded', () => {
		tree['c'] = {
			'ca': {
				'caa': {
					'collapsibleState': TreeItemCollapsibleState.None
				},
				'collapsibleState': TreeItemCollapsibleState.Expanded,
			},
			'cb': {
				'cba': {},
				'collapsibleState': TreeItemCollapsibleState.Collapsed,
			},
			'collapsibleState': TreeItemCollapsibleState.Expanded,
		};
		return testObject.$getElements('testDataProvider')
			.then(elements => {
				const actuals = elements.map(e => e.handle);
				assert.deepEqual(actuals, ['0/0:a', '0/1:b', '0/2:c']);
				assert.deepEqual(elements[2].children.map(e => e.handle), ['0/2:c/0:ca', '0/2:c/1:cb']);
				assert.deepEqual(elements[2].children[0].children.map(e => e.handle), ['0/2:c/0:ca/0:caa']);
				assert.deepEqual(elements[2].children[0].children[0].children, undefined);
				assert.deepEqual(elements[2].children[1].children, undefined);
			});
	});

	test('refresh root', function (done) {
		target.onRefresh.event(actuals => {
			assert.equal(0, actuals.length);
			done();
		});
		onDidChangeTreeData.fire();
	});

	test('refresh a parent node', function (done) {
		target.onRefresh.event(actuals => {
			assert.deepEqual(['0/1:b'], actuals);
			done();
		});
		onDidChangeTreeData.fire('b');
	});

	test('refresh a leaf node', function (done) {
		target.onRefresh.event(actuals => {
			assert.deepEqual(['0/1:b/1:bb'], actuals);
			done();
		});
		onDidChangeTreeData.fire('bb');
	});

	test('refresh calls are throttled on roots', function (done) {
		target.onRefresh.event(actuals => {
			assert.equal(0, actuals.length);
			done();
		});
		onDidChangeTreeData.fire();
		onDidChangeTreeData.fire();
		onDidChangeTreeData.fire();
		onDidChangeTreeData.fire();
	});

	test('refresh calls are throttled on elements', function (done) {
		target.onRefresh.event(actuals => {
			assert.deepEqual(['0/0:a', '0/1:b'], actuals);
			done();
		});

		onDidChangeTreeData.fire('a');
		onDidChangeTreeData.fire('b');
		onDidChangeTreeData.fire('b');
		onDidChangeTreeData.fire('a');
	});

	test('refresh calls are throttled on unknown elements', function (done) {
		target.onRefresh.event(actuals => {
			assert.deepEqual(['0/0:a', '0/1:b'], actuals);
			done();
		});

		onDidChangeTreeData.fire('a');
		onDidChangeTreeData.fire('b');
		onDidChangeTreeData.fire('g');
		onDidChangeTreeData.fire('a');
	});

	test('refresh calls are throttled on unknown elements and root', function (done) {
		target.onRefresh.event(actuals => {
			assert.equal(0, actuals.length);
			done();
		});

		onDidChangeTreeData.fire('a');
		onDidChangeTreeData.fire('b');
		onDidChangeTreeData.fire('g');
		onDidChangeTreeData.fire('');
	});

	test('refresh calls are throttled on elements and root', function (done) {
		target.onRefresh.event(actuals => {
			assert.equal(0, actuals.length);
			done();
		});

		onDidChangeTreeData.fire('a');
		onDidChangeTreeData.fire('b');
		onDidChangeTreeData.fire();
		onDidChangeTreeData.fire('a');
	});

	function aTreeDataProvider(): TreeDataProvider<string> {
		const getTreeElement = (element) => {
			let parent = tree;
			for (let i = 0; i < element.length; i++) {
				parent = parent[element.substring(0, i + 1)];
				if (!parent) {
					return null;
				}
			}
			return parent;
		};
		return {
			getChildren: (element: string): string[] => {
				if (!element) {
					return Object.keys(tree);
				}
				let treeElement = getTreeElement(element);
				if (treeElement) {
					const children = Object.keys(treeElement);
					const collapsibleStateIndex = children.indexOf('collapsibleState');
					if (collapsibleStateIndex !== -1) {
						children.splice(collapsibleStateIndex, 1);
					}
					return children;
				}
				return [];
			},
			getTreeItem: (element: string): TreeItem => {
				const treeElement = getTreeElement(element);
				return {
					label: element,
					collapsibleState: treeElement ? treeElement['collapsibleState'] : TreeItemCollapsibleState.Collapsed
				};
			},
			onDidChangeTreeData: onDidChangeTreeData.event
		};
	}

});
