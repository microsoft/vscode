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

suite('ExtHostConfiguration', function () {


	class RecordingShape extends mock<MainThreadTreeViewsShape>() {

		onRefresh = new Emitter<number[]>();

		$registerView(treeViewId: string): void {
		}

		$refresh(viewId: string, itemHandles: number[]): void {
			this.onRefresh.fire(itemHandles);
		}
	};

	let testObject: ExtHostTreeViews;
	let target: RecordingShape;
	let onDidChangeTreeData: Emitter<string>;

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
		testObject = new ExtHostTreeViews(target, new ExtHostCommands(threadService, new ExtHostHeapService()));
		onDidChangeTreeData = new Emitter<string>();
		testObject.registerTreeDataProvider('testDataProvider', aTreeDataProvider());

		testObject.$getElements('testDataProvider').then(elements => {
			for (const element of elements) {
				testObject.$getChildren('testDataProvider', element.handle);
			}
		});
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
			assert.deepEqual([1, 2], actuals);
			done();
		});

		onDidChangeTreeData.fire('a');
		onDidChangeTreeData.fire('b');
		onDidChangeTreeData.fire('b');
		onDidChangeTreeData.fire('a');
	});

	test('refresh calls are throttled on unknown elements', function (done) {
		target.onRefresh.event(actuals => {
			assert.deepEqual([1, 2], actuals);
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
		return <TreeDataProvider<string>>{
			getChildren: (element: string): string[] => {
				if (!element) {
					return ['a', 'b'];
				}
				if (element === 'a') {
					return ['aa', 'ab'];
				}
				if (element === 'b') {
					return ['ba', 'bb'];
				}
				return [];
			},
			getTreeItem: (element: string): TreeItem => {
				return <TreeItem>{
					label: element
				};
			},
			onDidChangeTreeData: onDidChangeTreeData.event
		};
	}

});
