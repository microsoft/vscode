/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import lifecycle = require('vs/base/common/lifecycle');
import _ = require('vs/base/parts/tree/browser/tree');
import WinJS = require('vs/base/common/winjs.base');
import model = require('vs/base/parts/tree/browser/treeModel');
import TreeDefaults = require('vs/base/parts/tree/browser/treeDefaults');
import { Event, Emitter } from 'vs/base/common/event';

export class FakeRenderer {

	public getHeight(tree: _.ITree, element: any): number {
		return 20;
	}

	public getTemplateId(tree: _.ITree, element: any): string {
		return 'fake';
	}

	public renderTemplate(tree: _.ITree, templateId: string, container: any): any {
		return null;
	}

	public renderElement(tree: _.ITree, element: any, templateId: string, templateData: any): void {
		// noop
	}

	public disposeTemplate(tree: _.ITree, templateId: string, templateData: any): void {
		// noop
	}
}

class TreeContext implements _.ITreeContext {

	public tree: _.ITree = null;
	public options: _.ITreeOptions = { autoExpandSingleChildren: true };
	public dataSource: _.IDataSource;
	public renderer: _.IRenderer;
	public controller: _.IController;
	public dnd: _.IDragAndDrop;
	public filter: _.IFilter;
	public sorter: _.ISorter;

	constructor(public configuration: _.ITreeConfiguration) {
		this.dataSource = configuration.dataSource;
		this.renderer = configuration.renderer || new FakeRenderer();
		this.controller = configuration.controller;
		this.dnd = configuration.dnd;
		this.filter = configuration.filter || new TreeDefaults.DefaultFilter();
		this.sorter = configuration.sorter || new TreeDefaults.DefaultSorter();
	}
}

class TreeModel extends model.TreeModel {

	constructor(configuration: _.ITreeConfiguration) {
		super(new TreeContext(configuration));
	}
}

class EventCounter {

	private listeners: lifecycle.IDisposable[];
	private _count: number;

	constructor() {
		this.listeners = [];
		this._count = 0;
	}

	public listen<T>(event: Event<T>, fn: (e: T) => void = null): () => void {
		let r = event(data => {
			this._count++;
			if (fn) {
				fn(data);
			}
		});

		this.listeners.push(r);

		return () => {
			let idx = this.listeners.indexOf(r);
			if (idx > -1) {
				this.listeners.splice(idx, 1);
				r.dispose();
			}
		};
	}

	public up(): void {
		this._count++;
	}

	public get count(): number {
		return this._count;
	}

	public dispose(): void {
		this.listeners = lifecycle.dispose(this.listeners);
		this._count = -1;
	}
}

var SAMPLE: any = {
	ONE: { id: 'one' },

	AB: {
		id: 'ROOT', children: [
			{
				id: 'a', children: [
					{ id: 'aa' },
					{ id: 'ab' }
				]
			},
			{ id: 'b' },
			{
				id: 'c', children: [
					{ id: 'ca' },
					{ id: 'cb' }
				]
			}
		]
	},

	DEEP: {
		id: 'ROOT', children: [
			{
				id: 'a', children: [
					{
						id: 'x', children: [
							{ id: 'xa' },
							{ id: 'xb' },
						]
					}
				]
			},
			{ id: 'b' }
		]
	},

	DEEP2: {
		id: 'ROOT', children: [
			{
				id: 'a', children: [
					{
						id: 'x', children: [
							{ id: 'xa' },
							{ id: 'xb' },
						]
					},
					{ id: 'y' }
				]
			},
			{ id: 'b' }
		]
	}
};

class TestDataSource implements _.IDataSource {
	public getId(tree, element): string {
		return element.id;
	}

	public hasChildren(tree, element): boolean {
		return !!element.children;
	}

	public getChildren(tree, element): WinJS.Promise {
		return WinJS.TPromise.as(element.children);
	}

	public getParent(tree, element): WinJS.Promise {
		throw new Error('Not implemented');
	}
}

suite('TreeModel', () => {
	var model: model.TreeModel;
	var counter: EventCounter;

	setup(() => {
		counter = new EventCounter();
		model = new TreeModel({
			dataSource: new TestDataSource()
		});
	});

	teardown(() => {
		counter.dispose();
		model.dispose();
	});

	test('setInput, getInput', () => {
		model.setInput(SAMPLE.ONE);
		assert.equal(model.getInput(), SAMPLE.ONE);
	});

	test('refresh() refreshes all', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			counter.listen(model.onRefresh); // 1
			counter.listen(model.onDidRefresh); // 1
			counter.listen(model.onDidRefreshItem); // 4
			counter.listen(model.onRefreshItemChildren); // 1
			counter.listen(model.onDidRefreshItemChildren); // 1
			return model.refresh(null);
		}).then(() => {
			assert.equal(counter.count, 8);
		});
	});

	test('refresh(root) refreshes all', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			counter.listen(model.onRefresh); // 1
			counter.listen(model.onDidRefresh); // 1
			counter.listen(model.onDidRefreshItem); // 4
			counter.listen(model.onRefreshItemChildren); // 1
			counter.listen(model.onDidRefreshItemChildren); // 1
			return model.refresh(SAMPLE.AB);
		}).then(() => {
			assert.equal(counter.count, 8);
		});
	});

	test('refresh(root, false) refreshes the root', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			counter.listen(model.onRefresh); // 1
			counter.listen(model.onDidRefresh); // 1
			counter.listen(model.onDidRefreshItem); // 1
			counter.listen(model.onRefreshItemChildren); // 1
			counter.listen(model.onDidRefreshItemChildren); // 1
			return model.refresh(SAMPLE.AB, false);
		}).then(() => {
			assert.equal(counter.count, 5);
		});
	});

	test('refresh(collapsed element) does not refresh descendants', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			counter.listen(model.onRefresh); // 1
			counter.listen(model.onDidRefresh); // 1
			counter.listen(model.onDidRefreshItem); // 1
			counter.listen(model.onRefreshItemChildren); // 0
			counter.listen(model.onDidRefreshItemChildren); // 0
			return model.refresh(SAMPLE.AB.children[0]);
		}).then(() => {
			assert.equal(counter.count, 3);
		});
	});

	test('refresh(expanded element) refreshes the element and descendants', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			model.expand(SAMPLE.AB.children[0]);

			counter.listen(model.onRefresh); // 1
			counter.listen(model.onDidRefresh); // 1
			counter.listen(model.onDidRefreshItem); // 3
			counter.listen(model.onRefreshItemChildren); // 1
			counter.listen(model.onDidRefreshItemChildren); // 1
			return model.refresh(SAMPLE.AB.children[0]);
		}).then(() => {
			assert.equal(counter.count, 7);
		});
	});

	test('refresh(element, false) refreshes the element', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			model.expand(SAMPLE.AB.children[0]);

			counter.listen(model.onRefresh); // 1
			counter.listen(model.onDidRefresh); // 1
			counter.listen(model.onDidRefreshItem, item => { // 1
				assert.equal(item.id, 'a');
				counter.up();
			});
			counter.listen(model.onRefreshItemChildren); // 1
			counter.listen(model.onDidRefreshItemChildren); // 1
			return model.refresh(SAMPLE.AB.children[0], false);
		}).then(() => {
			assert.equal(counter.count, 6);
		});
	});

	test('depths', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			return model.expandAll(['a', 'c']).then(() => {
				counter.listen(model.onDidRefreshItem, item => {
					switch (item.id) {
						case 'ROOT': assert.equal(item.getDepth(), 0); break;
						case 'a': assert.equal(item.getDepth(), 1); break;
						case 'aa': assert.equal(item.getDepth(), 2); break;
						case 'ab': assert.equal(item.getDepth(), 2); break;
						case 'b': assert.equal(item.getDepth(), 1); break;
						case 'c': assert.equal(item.getDepth(), 1); break;
						case 'ca': assert.equal(item.getDepth(), 2); break;
						case 'cb': assert.equal(item.getDepth(), 2); break;
						default: return;
					}
					counter.up();
				});

				return model.refresh();
			});
		}).then(() => {
			assert.equal(counter.count, 16);
		});
	});

	test('intersections', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			return model.expandAll(['a', 'c']).then(() => {
				// going internals
				var r = (<any>model).registry;

				assert(r.getItem('a').intersects(r.getItem('a')));
				assert(r.getItem('a').intersects(r.getItem('aa')));
				assert(r.getItem('a').intersects(r.getItem('ab')));
				assert(r.getItem('aa').intersects(r.getItem('a')));
				assert(r.getItem('ab').intersects(r.getItem('a')));
				assert(!r.getItem('aa').intersects(r.getItem('ab')));
				assert(!r.getItem('a').intersects(r.getItem('b')));
				assert(!r.getItem('a').intersects(r.getItem('c')));
				assert(!r.getItem('a').intersects(r.getItem('ca')));
				assert(!r.getItem('aa').intersects(r.getItem('ca')));
			});
		});
	});
});

suite('TreeModel - TreeNavigator', () => {
	var model: model.TreeModel;
	var counter: EventCounter;

	setup(() => {
		counter = new EventCounter();
		model = new TreeModel({
			dataSource: new TestDataSource()
		});
	});

	teardown(() => {
		counter.dispose();
		model.dispose();
	});

	test('next()', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			var nav = model.getNavigator();
			assert.equal(nav.next().id, 'a');
			assert.equal(nav.next().id, 'b');
			assert.equal(nav.next().id, 'c');
			assert.equal(nav.next() && false, null);
		});
	});

	test('previous()', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			var nav = model.getNavigator();

			nav.next();
			nav.next();

			assert.equal(nav.next().id, 'c');
			assert.equal(nav.previous().id, 'b');
			assert.equal(nav.previous().id, 'a');
			assert.equal(nav.previous() && false, null);
		});
	});

	test('parent()', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			return model.expandAll([{ id: 'a' }, { id: 'c' }]).then(() => {
				var nav = model.getNavigator();

				assert.equal(nav.next().id, 'a');
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.parent().id, 'a');

				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.parent().id, 'a');

				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.next().id, 'b');
				assert.equal(nav.next().id, 'c');
				assert.equal(nav.next().id, 'ca');
				assert.equal(nav.parent().id, 'c');

				assert.equal(nav.parent() && false, null);
			});
		});
	});

	test('next() - scoped', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			var nav = model.getNavigator(SAMPLE.AB.children[0]);
			return model.expand({ id: 'a' }).then(() => {
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.next() && false, null);
			});
		});
	});

	test('previous() - scoped', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			var nav = model.getNavigator(SAMPLE.AB.children[0]);
			return model.expand({ id: 'a' }).then(() => {
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.previous().id, 'aa');
				assert.equal(nav.previous() && false, null);
			});
		});
	});

	test('parent() - scoped', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			return model.expandAll([{ id: 'a' }, { id: 'c' }]).then(() => {
				var nav = model.getNavigator(SAMPLE.AB.children[0]);

				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.parent() && false, null);
			});
		});
	});

	test('next() - non sub tree only', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			var nav = model.getNavigator(SAMPLE.AB.children[0], false);
			return model.expand({ id: 'a' }).then(() => {
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.next().id, 'b');
				assert.equal(nav.next().id, 'c');
				assert.equal(nav.next() && false, null);
			});
		});
	});

	test('previous() - non sub tree only', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			var nav = model.getNavigator(SAMPLE.AB.children[0], false);
			return model.expand({ id: 'a' }).then(() => {
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.next().id, 'b');
				assert.equal(nav.next().id, 'c');
				assert.equal(nav.previous().id, 'b');
				assert.equal(nav.previous().id, 'ab');
				assert.equal(nav.previous().id, 'aa');
				assert.equal(nav.previous().id, 'a');
				assert.equal(nav.previous() && false, null);
			});
		});
	});

	test('parent() - non sub tree only', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			return model.expandAll([{ id: 'a' }, { id: 'c' }]).then(() => {
				var nav = model.getNavigator(SAMPLE.AB.children[0], false);

				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.parent().id, 'a');
				assert.equal(nav.parent() && false, null);
			});
		});
	});

	test('deep next() - scoped', () => {
		return model.setInput(SAMPLE.DEEP).then(() => {
			return model.expand(SAMPLE.DEEP.children[0]).then(() => {
				return model.expand(SAMPLE.DEEP.children[0].children[0]).then(() => {
					var nav = model.getNavigator(SAMPLE.DEEP.children[0].children[0]);
					assert.equal(nav.next().id, 'xa');
					assert.equal(nav.next().id, 'xb');
					assert.equal(nav.next() && false, null);
				});
			});
		});
	});

	test('deep previous() - scoped', () => {
		return model.setInput(SAMPLE.DEEP).then(() => {
			return model.expand(SAMPLE.DEEP.children[0]).then(() => {
				return model.expand(SAMPLE.DEEP.children[0].children[0]).then(() => {
					var nav = model.getNavigator(SAMPLE.DEEP.children[0].children[0]);
					assert.equal(nav.next().id, 'xa');
					assert.equal(nav.next().id, 'xb');
					assert.equal(nav.previous().id, 'xa');
					assert.equal(nav.previous() && false, null);
				});
			});
		});
	});

	test('last()', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			return model.expandAll([{ id: 'a' }, { id: 'c' }]).then(() => {
				const nav = model.getNavigator();
				assert.equal(nav.last().id, 'cb');
			});
		});
	});
});

suite('TreeModel - Expansion', () => {
	var model: model.TreeModel;
	var counter: EventCounter;

	setup(() => {
		counter = new EventCounter();
		model = new TreeModel({
			dataSource: new TestDataSource()
		});
	});

	teardown(() => {
		counter.dispose();
		model.dispose();
	});

	test('collapse, expand', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			counter.listen(model.onExpandItem, (e) => {
				assert.equal(e.item.id, 'a');
				var nav = model.getNavigator(e.item);
				assert.equal(nav.next() && false, null);
			});

			counter.listen(model.onDidExpandItem, (e) => {
				assert.equal(e.item.id, 'a');
				var nav = model.getNavigator(e.item);
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.next() && false, null);
			});

			assert(!model.isExpanded(SAMPLE.AB.children[0]));

			var nav = model.getNavigator();
			assert.equal(nav.next().id, 'a');
			assert.equal(nav.next().id, 'b');
			assert.equal(nav.next().id, 'c');
			assert.equal(nav.next() && false, null);

			assert.equal(model.getExpandedElements().length, 0);

			return model.expand(SAMPLE.AB.children[0]).then(() => {
				assert(model.isExpanded(SAMPLE.AB.children[0]));

				nav = model.getNavigator();
				assert.equal(nav.next().id, 'a');
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.next().id, 'b');
				assert.equal(nav.next().id, 'c');
				assert.equal(nav.next() && false, null);

				var expandedElements = model.getExpandedElements();
				assert.equal(expandedElements.length, 1);
				assert.equal(expandedElements[0].id, 'a');

				assert.equal(counter.count, 2);
			});
		});
	});

	test('toggleExpansion', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			assert(!model.isExpanded(SAMPLE.AB.children[0]));

			return model.toggleExpansion(SAMPLE.AB.children[0]).then(() => {
				assert(model.isExpanded(SAMPLE.AB.children[0]));
				assert(!model.isExpanded(SAMPLE.AB.children[0].children[0]));

				return model.toggleExpansion(SAMPLE.AB.children[0].children[0]).then(() => {
					assert(!model.isExpanded(SAMPLE.AB.children[0].children[0]));

					return model.toggleExpansion(SAMPLE.AB.children[0]).then(() => {
						assert(!model.isExpanded(SAMPLE.AB.children[0]));
					});
				});
			});
		});
	});

	test('collapseAll', () => {
		return model.setInput(SAMPLE.DEEP2).then(() => {
			return model.expand(SAMPLE.DEEP2.children[0]).then(() => {
				return model.expand(SAMPLE.DEEP2.children[0].children[0]).then(() => {

					assert(model.isExpanded(SAMPLE.DEEP2.children[0]));
					assert(model.isExpanded(SAMPLE.DEEP2.children[0].children[0]));

					return model.collapseAll().then(() => {
						assert(!model.isExpanded(SAMPLE.DEEP2.children[0]));

						return model.expand(SAMPLE.DEEP2.children[0]).then(() => {
							assert(!model.isExpanded(SAMPLE.DEEP2.children[0].children[0]));
						});
					});
				});
			});
		});
	});

	test('collapseDeepestExpandedLevel', () => {
		return model.setInput(SAMPLE.DEEP2).then(() => {
			return model.expand(SAMPLE.DEEP2.children[0]).then(() => {
				return model.expand(SAMPLE.DEEP2.children[0].children[0]).then(() => {

					assert(model.isExpanded(SAMPLE.DEEP2.children[0]));
					assert(model.isExpanded(SAMPLE.DEEP2.children[0].children[0]));

					return model.collapseDeepestExpandedLevel().then(() => {
						assert(model.isExpanded(SAMPLE.DEEP2.children[0]));
						assert(!model.isExpanded(SAMPLE.DEEP2.children[0].children[0]));
					});
				});
			});
		});
	});

	test('auto expand single child folders', () => {
		return model.setInput(SAMPLE.DEEP).then(() => {
			return model.expand(SAMPLE.DEEP.children[0]).then(() => {
				assert(model.isExpanded(SAMPLE.DEEP.children[0]));
				assert(model.isExpanded(SAMPLE.DEEP.children[0].children[0]));
			});
		});
	});

	test('expand can trigger refresh', () => {
		// MUnit.expect(16);
		return model.setInput(SAMPLE.AB).then(() => {

			assert(!model.isExpanded(SAMPLE.AB.children[0]));

			var nav = model.getNavigator();
			assert.equal(nav.next().id, 'a');
			assert.equal(nav.next().id, 'b');
			assert.equal(nav.next().id, 'c');
			assert.equal(nav.next() && false, null);

			var f: () => void = counter.listen(model.onRefreshItemChildren, (e) => {
				assert.equal(e.item.id, 'a');
				f();
			});

			var g: () => void = counter.listen(model.onDidRefreshItemChildren, (e) => {
				assert.equal(e.item.id, 'a');
				g();
			});

			return model.expand(SAMPLE.AB.children[0]).then(() => {
				assert(model.isExpanded(SAMPLE.AB.children[0]));

				nav = model.getNavigator();
				assert.equal(nav.next().id, 'a');
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.next().id, 'b');
				assert.equal(nav.next().id, 'c');
				assert.equal(nav.next() && false, null);

				assert.equal(counter.count, 2);
			});
		});
	});

	test('top level collapsed', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			return model.collapseAll([{ id: 'a' }, { id: 'b' }, { id: 'c' }]).then(() => {
				var nav = model.getNavigator();
				assert.equal(nav.next().id, 'a');
				assert.equal(nav.next().id, 'b');
				assert.equal(nav.next().id, 'c');
				assert.equal(nav.previous().id, 'b');
				assert.equal(nav.previous().id, 'a');
				assert.equal(nav.previous() && false, null);
			});
		});
	});

	test('shouldAutoexpand', () => {
		// setup
		const model = new TreeModel({
			dataSource: {
				getId: (_, e) => e,
				hasChildren: (_, e) => true,
				getChildren: (_, e) => {
					if (e === 'root') { return WinJS.TPromise.wrap(['a', 'b', 'c']); }
					if (e === 'b') { return WinJS.TPromise.wrap(['b1']); }
					return WinJS.TPromise.as([]);
				},
				getParent: (_, e): WinJS.Promise => { throw new Error('not implemented'); },
				shouldAutoexpand: (_, e) => e === 'b'
			}
		});

		return model.setInput('root').then(() => {
			return model.refresh('root', true);
		}).then(() => {
			assert(!model.isExpanded('a'));
			assert(model.isExpanded('b'));
			assert(!model.isExpanded('c'));
		});
	});
});

class TestFilter implements _.IFilter {

	public fn: (any) => boolean;

	constructor() {
		this.fn = () => true;
	}

	public isVisible(tree, element): boolean {
		return this.fn(element);
	}
}

suite('TreeModel - Filter', () => {
	var model: model.TreeModel;
	var counter: EventCounter;
	var filter: TestFilter;

	setup(() => {
		counter = new EventCounter();
		filter = new TestFilter();
		model = new TreeModel({
			dataSource: new TestDataSource(),
			filter: filter
		});
	});

	teardown(() => {
		counter.dispose();
		model.dispose();
	});

	test('no filter', () => {
		return model.setInput(SAMPLE.AB).then(() => {

			return model.expandAll([{ id: 'a' }, { id: 'c' }]).then(() => {
				var nav = model.getNavigator();
				assert.equal(nav.next().id, 'a');
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.next().id, 'b');
				assert.equal(nav.next().id, 'c');
				assert.equal(nav.next().id, 'ca');
				assert.equal(nav.next().id, 'cb');

				assert.equal(nav.previous().id, 'ca');
				assert.equal(nav.previous().id, 'c');
				assert.equal(nav.previous().id, 'b');
				assert.equal(nav.previous().id, 'ab');
				assert.equal(nav.previous().id, 'aa');
				assert.equal(nav.previous().id, 'a');
				assert.equal(nav.previous() && false, null);
			});
		});
	});

	test('filter all', () => {
		filter.fn = () => false;

		return model.setInput(SAMPLE.AB).then(() => {
			return model.refresh().then(() => {
				var nav = model.getNavigator();
				assert.equal(nav.next() && false, null);
			});
		});
	});

	test('simple filter', () => {
		// hide elements that do not start with 'a'
		filter.fn = (e) => e.id[0] === 'a';

		return model.setInput(SAMPLE.AB).then(() => {
			return model.expand({ id: 'a' }).then(() => {

				var nav = model.getNavigator();
				assert.equal(nav.next().id, 'a');
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'ab');
				assert.equal(nav.previous().id, 'aa');
				assert.equal(nav.previous().id, 'a');
				assert.equal(nav.previous() && false, null);
			});
		});
	});

	test('simple filter 2', () => {
		// hide 'ab'
		filter.fn = (e) => e.id !== 'ab';

		return model.setInput(SAMPLE.AB).then(() => {
			return model.expand({ id: 'a' }).then(() => {
				var nav = model.getNavigator();
				assert.equal(nav.next().id, 'a');
				assert.equal(nav.next().id, 'aa');
				assert.equal(nav.next().id, 'b');
				assert.equal(nav.next().id, 'c');
				assert.equal(nav.next() && false, null);
			});
		});
	});

	test('simple filter, opposite', () => {
		// hide elements that start with 'a'
		filter.fn = (e) => e.id[0] !== 'a';

		return model.setInput(SAMPLE.AB).then(() => {
			return model.expand({ id: 'c' }).then(() => {

				var nav = model.getNavigator();
				assert.equal(nav.next().id, 'b');
				assert.equal(nav.next().id, 'c');
				assert.equal(nav.next().id, 'ca');
				assert.equal(nav.next().id, 'cb');
				assert.equal(nav.previous().id, 'ca');
				assert.equal(nav.previous().id, 'c');
				assert.equal(nav.previous().id, 'b');
				assert.equal(nav.previous() && false, null);
			});
		});
	});

	test('simple filter, mischieving', () => {
		// hide the element 'a'
		filter.fn = (e) => e.id !== 'a';

		return model.setInput(SAMPLE.AB).then(() => {
			return model.expand({ id: 'c' }).then(() => {

				var nav = model.getNavigator();
				assert.equal(nav.next().id, 'b');
				assert.equal(nav.next().id, 'c');
				assert.equal(nav.next().id, 'ca');
				assert.equal(nav.next().id, 'cb');
				assert.equal(nav.previous().id, 'ca');
				assert.equal(nav.previous().id, 'c');
				assert.equal(nav.previous().id, 'b');
				assert.equal(nav.previous() && false, null);
			});
		});
	});

	test('simple filter & previous', () => {
		// hide 'b'
		filter.fn = (e) => e.id !== 'b';

		return model.setInput(SAMPLE.AB).then(() => {
			var nav = model.getNavigator({ id: 'c' }, false);
			assert.equal(nav.previous().id, 'a');
			assert.equal(nav.previous() && false, null);
		});
	});
});

suite('TreeModel - Traits', () => {
	var model: model.TreeModel;
	var counter: EventCounter;

	setup(() => {
		counter = new EventCounter();
		model = new TreeModel({
			dataSource: new TestDataSource()
		});
	});

	teardown(() => {
		counter.dispose();
		model.dispose();
	});

	test('Selection', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			assert.equal(model.getSelection().length, 0);
			model.select(SAMPLE.AB.children[1]);
			assert(model.isSelected(SAMPLE.AB.children[1]));
			assert.equal(model.getSelection().length, 1);
			model.select(SAMPLE.AB.children[0]);
			assert(model.isSelected(SAMPLE.AB.children[0]));
			assert.equal(model.getSelection().length, 2);
			model.select(SAMPLE.AB.children[2]);
			assert(model.isSelected(SAMPLE.AB.children[2]));
			assert.equal(model.getSelection().length, 3);
			model.deselect(SAMPLE.AB.children[0]);
			assert(!model.isSelected(SAMPLE.AB.children[0]));
			assert.equal(model.getSelection().length, 2);
			model.setSelection([]);
			assert(!model.isSelected(SAMPLE.AB.children[0]));
			assert(!model.isSelected(SAMPLE.AB.children[1]));
			assert(!model.isSelected(SAMPLE.AB.children[2]));
			assert.equal(model.getSelection().length, 0);
			model.selectAll([SAMPLE.AB.children[0], SAMPLE.AB.children[1], SAMPLE.AB.children[2]]);
			assert.equal(model.getSelection().length, 3);
			model.select(SAMPLE.AB.children[0]);
			assert.equal(model.getSelection().length, 3);
			model.deselectAll([SAMPLE.AB.children[0], SAMPLE.AB.children[1], SAMPLE.AB.children[2]]);
			assert.equal(model.getSelection().length, 0);
			model.deselect(SAMPLE.AB.children[0]);
			assert.equal(model.getSelection().length, 0);

			model.setSelection([SAMPLE.AB.children[0]]);
			assert.equal(model.getSelection().length, 1);
			assert(model.isSelected(SAMPLE.AB.children[0]));
			assert(!model.isSelected(SAMPLE.AB.children[1]));
			assert(!model.isSelected(SAMPLE.AB.children[2]));

			model.setSelection([SAMPLE.AB.children[0], SAMPLE.AB.children[1], SAMPLE.AB.children[2]]);
			assert.equal(model.getSelection().length, 3);
			assert(model.isSelected(SAMPLE.AB.children[0]));
			assert(model.isSelected(SAMPLE.AB.children[1]));
			assert(model.isSelected(SAMPLE.AB.children[2]));

			model.setSelection([SAMPLE.AB.children[1], SAMPLE.AB.children[2]]);
			assert.equal(model.getSelection().length, 2);
			assert(!model.isSelected(SAMPLE.AB.children[0]));
			assert(model.isSelected(SAMPLE.AB.children[1]));
			assert(model.isSelected(SAMPLE.AB.children[2]));

			model.setSelection([]);
			assert.deepEqual(model.getSelection(), []);
			assert.equal(model.getSelection().length, 0);
			assert(!model.isSelected(SAMPLE.AB.children[0]));
			assert(!model.isSelected(SAMPLE.AB.children[1]));
			assert(!model.isSelected(SAMPLE.AB.children[2]));

			model.selectNext();
			assert.equal(model.getSelection().length, 1);
			assert(model.isSelected(SAMPLE.AB.children[0]));

			model.selectNext();
			assert.equal(model.getSelection().length, 1);
			assert(model.isSelected(SAMPLE.AB.children[1]));

			model.selectNext();
			assert.equal(model.getSelection().length, 1);
			assert(model.isSelected(SAMPLE.AB.children[2]));

			model.selectNext();
			assert.equal(model.getSelection().length, 1);
			assert(model.isSelected(SAMPLE.AB.children[2]));

			model.selectPrevious();
			assert.equal(model.getSelection().length, 1);
			assert(model.isSelected(SAMPLE.AB.children[1]));

			model.selectPrevious();
			assert.equal(model.getSelection().length, 1);
			assert(model.isSelected(SAMPLE.AB.children[0]));

			model.selectPrevious();
			assert.equal(model.getSelection().length, 1);
			assert(model.isSelected(SAMPLE.AB.children[0]));

			model.selectNext(2);
			assert.equal(model.getSelection().length, 1);
			assert(model.isSelected(SAMPLE.AB.children[2]));

			model.selectPrevious(4);
			assert.equal(model.getSelection().length, 1);
			assert(model.isSelected(SAMPLE.AB.children[0]));

			assert.equal(model.isSelected(SAMPLE.AB.children[0]), true);
			assert.equal(model.isSelected(SAMPLE.AB.children[2]), false);
		});
	});

	test('Focus', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			assert(!model.getFocus());
			model.setFocus(SAMPLE.AB.children[1]);
			assert(model.isFocused(SAMPLE.AB.children[1]));
			assert(model.getFocus());
			model.setFocus(SAMPLE.AB.children[0]);
			assert(model.isFocused(SAMPLE.AB.children[0]));
			assert(model.getFocus());
			model.setFocus(SAMPLE.AB.children[2]);
			assert(model.isFocused(SAMPLE.AB.children[2]));
			assert(model.getFocus());
			model.setFocus();
			assert(!model.isFocused(SAMPLE.AB.children[0]));
			assert(!model.isFocused(SAMPLE.AB.children[1]));
			assert(!model.isFocused(SAMPLE.AB.children[2]));
			assert(!model.getFocus());

			model.setFocus(SAMPLE.AB.children[0]);
			assert(model.getFocus());
			assert(model.isFocused(SAMPLE.AB.children[0]));
			assert(!model.isFocused(SAMPLE.AB.children[1]));
			assert(!model.isFocused(SAMPLE.AB.children[2]));

			model.setFocus();
			assert(!model.getFocus());
			assert(!model.isFocused(SAMPLE.AB.children[0]));
			assert(!model.isFocused(SAMPLE.AB.children[1]));
			assert(!model.isFocused(SAMPLE.AB.children[2]));

			model.focusNext();
			assert(model.getFocus());
			assert(model.isFocused(SAMPLE.AB.children[0]));

			model.focusNext();
			assert(model.getFocus());
			assert(model.isFocused(SAMPLE.AB.children[1]));

			model.focusNext();
			assert(model.getFocus());
			assert(model.isFocused(SAMPLE.AB.children[2]));

			model.focusNext();
			assert(model.getFocus());
			assert(model.isFocused(SAMPLE.AB.children[2]));

			model.focusPrevious();
			assert(model.getFocus());
			assert(model.isFocused(SAMPLE.AB.children[1]));

			model.focusPrevious();
			assert(model.getFocus());
			assert(model.isFocused(SAMPLE.AB.children[0]));

			model.focusPrevious();
			assert(model.getFocus());
			assert(model.isFocused(SAMPLE.AB.children[0]));

			model.focusNext(2);
			assert(model.getFocus());
			assert(model.isFocused(SAMPLE.AB.children[2]));

			model.focusPrevious(4);
			assert(model.getFocus());
			assert(model.isFocused(SAMPLE.AB.children[0]));

			assert.equal(model.isFocused(SAMPLE.AB.children[0]), true);
			assert.equal(model.isFocused(SAMPLE.AB.children[2]), false);

			model.focusFirst();
			assert(model.isFocused(SAMPLE.AB.children[0]));
			model.focusNth(0);
			assert(model.isFocused(SAMPLE.AB.children[0]));
			model.focusNth(1);
			assert(model.isFocused(SAMPLE.AB.children[1]));
		});
	});

	test('Highlight', () => {
		return model.setInput(SAMPLE.AB).then(() => {
			assert(!model.getHighlight());
			model.setHighlight(SAMPLE.AB.children[1]);
			assert(model.isHighlighted(SAMPLE.AB.children[1]));
			assert(model.getHighlight());
			model.setHighlight(SAMPLE.AB.children[0]);
			assert(model.isHighlighted(SAMPLE.AB.children[0]));
			assert(model.getHighlight());
			model.setHighlight(SAMPLE.AB.children[2]);
			assert(model.isHighlighted(SAMPLE.AB.children[2]));
			assert(model.getHighlight());
			model.setHighlight();
			assert(!model.isHighlighted(SAMPLE.AB.children[0]));
			assert(!model.isHighlighted(SAMPLE.AB.children[1]));
			assert(!model.isHighlighted(SAMPLE.AB.children[2]));
			assert(!model.getHighlight());

			model.setHighlight(SAMPLE.AB.children[0]);
			assert(model.getHighlight());
			assert(model.isHighlighted(SAMPLE.AB.children[0]));
			assert(!model.isHighlighted(SAMPLE.AB.children[1]));
			assert(!model.isHighlighted(SAMPLE.AB.children[2]));

			assert.equal(model.isHighlighted(SAMPLE.AB.children[0]), true);
			assert.equal(model.isHighlighted(SAMPLE.AB.children[2]), false);

			model.setHighlight();
			assert(!model.getHighlight());
			assert(!model.isHighlighted(SAMPLE.AB.children[0]));
			assert(!model.isHighlighted(SAMPLE.AB.children[1]));
			assert(!model.isHighlighted(SAMPLE.AB.children[2]));
		});
	});
});

class DynamicModel implements _.IDataSource {

	private data: any;
	public promiseFactory: { (): WinJS.Promise; };

	private _onGetChildren = new Emitter<any>();
	readonly onGetChildren: Event<any> = this._onGetChildren.event;

	private _onDidGetChildren = new Emitter<any>();
	readonly onDidGetChildren: Event<any> = this._onDidGetChildren.event;

	constructor() {
		this.data = { root: [] };
		this.promiseFactory = null;
	}

	public addChild(parent, child): void {
		if (!this.data[parent]) {
			this.data[parent] = [];
		}
		this.data[parent].push(child);
	}

	public removeChild(parent, child): void {
		this.data[parent].splice(this.data[parent].indexOf(child), 1);
		if (this.data[parent].length === 0) {
			delete this.data[parent];
		}
	}

	public move(element, oldParent, newParent): void {
		this.removeChild(oldParent, element);
		this.addChild(newParent, element);
	}

	public rename(parent, oldName, newName): void {
		this.removeChild(parent, oldName);
		this.addChild(parent, newName);
	}

	public getId(tree, element): string {
		return element;
	}

	public hasChildren(tree, element): boolean {
		return !!this.data[element];
	}

	public getChildren(tree, element): WinJS.Promise {
		this._onGetChildren.fire(element);
		var result = this.promiseFactory ? this.promiseFactory() : WinJS.TPromise.as(null);
		return result.then(() => {
			this._onDidGetChildren.fire(element);
			return WinJS.TPromise.as(this.data[element]);
		});
	}

	public getParent(tree, element): WinJS.Promise {
		throw new Error('Not implemented');
	}
}

suite('TreeModel - Dynamic data model', () => {
	var model: model.TreeModel;
	var dataModel: DynamicModel;
	var counter: EventCounter;

	setup(() => {
		counter = new EventCounter();
		dataModel = new DynamicModel();
		model = new TreeModel({
			dataSource: dataModel,
		});
	});

	teardown(() => {
		counter.dispose();
		model.dispose();
	});

	test('items get property disposed', () => {
		dataModel.addChild('root', 'grandfather');
		dataModel.addChild('grandfather', 'father');
		dataModel.addChild('father', 'son');
		dataModel.addChild('father', 'daughter');
		dataModel.addChild('son', 'baby');

		return model.setInput('root').then(() => {
			return model.expandAll(['grandfather', 'father', 'son']).then(() => {
				dataModel.removeChild('grandfather', 'father');

				var items = ['baby', 'son', 'daughter', 'father'];
				var times = 0;
				counter.listen(model.onDidDisposeItem, item => {
					assert.equal(items[times++], item.id);
				});

				return model.refresh().then(() => {
					assert.equal(times, items.length);
					assert.equal(counter.count, 4);
				});
			});
		});
	});

	test('addChild, removeChild, collapse', () => {
		dataModel.addChild('root', 'super');
		dataModel.addChild('root', 'hyper');
		dataModel.addChild('root', 'mega');

		return model.setInput('root').then(() => {
			var nav = model.getNavigator();
			assert.equal(nav.next().id, 'super');
			assert.equal(nav.next().id, 'hyper');
			assert.equal(nav.next().id, 'mega');
			assert.equal(nav.next() && false, null);

			dataModel.removeChild('root', 'hyper');
			return model.refresh().then(() => {
				nav = model.getNavigator();
				assert.equal(nav.next().id, 'super');
				assert.equal(nav.next().id, 'mega');
				assert.equal(nav.next() && false, null);

				dataModel.addChild('mega', 'micro');
				dataModel.addChild('mega', 'nano');
				dataModel.addChild('mega', 'pico');

				return model.refresh().then(() => {
					return model.expand('mega').then(() => {
						nav = model.getNavigator();
						assert.equal(nav.next().id, 'super');
						assert.equal(nav.next().id, 'mega');
						assert.equal(nav.next().id, 'micro');
						assert.equal(nav.next().id, 'nano');
						assert.equal(nav.next().id, 'pico');
						assert.equal(nav.next() && false, null);

						model.collapse('mega');
						nav = model.getNavigator();
						assert.equal(nav.next().id, 'super');
						assert.equal(nav.next().id, 'mega');
						assert.equal(nav.next() && false, null);
					});
				});
			});
		});
	});

	test('move', () => {
		dataModel.addChild('root', 'super');
		dataModel.addChild('super', 'apples');
		dataModel.addChild('super', 'bananas');
		dataModel.addChild('super', 'pears');
		dataModel.addChild('root', 'hyper');
		dataModel.addChild('root', 'mega');

		return model.setInput('root').then(() => {

			return model.expand('super').then(() => {

				var nav = model.getNavigator();
				assert.equal(nav.next().id, 'super');
				assert.equal(nav.next().id, 'apples');
				assert.equal(nav.next().id, 'bananas');
				assert.equal(nav.next().id, 'pears');
				assert.equal(nav.next().id, 'hyper');
				assert.equal(nav.next().id, 'mega');
				assert.equal(nav.next() && false, null);

				dataModel.move('bananas', 'super', 'hyper');
				dataModel.move('apples', 'super', 'mega');

				return model.refresh().then(() => {

					return model.expandAll(['hyper', 'mega']).then(() => {
						nav = model.getNavigator();
						assert.equal(nav.next().id, 'super');
						assert.equal(nav.next().id, 'pears');
						assert.equal(nav.next().id, 'hyper');
						assert.equal(nav.next().id, 'bananas');
						assert.equal(nav.next().id, 'mega');
						assert.equal(nav.next().id, 'apples');
						assert.equal(nav.next() && false, null);
					});
				});
			});
		});
	});

	test('refreshing grandfather recursively should not refresh collapsed father\'s children immediately', () => {
		dataModel.addChild('root', 'grandfather');
		dataModel.addChild('grandfather', 'father');
		dataModel.addChild('father', 'son');

		return model.setInput('root').then(() => {
			model.expand('grandfather');
			model.collapse('father');

			var times = 0;
			var listener = dataModel.onGetChildren((element) => {
				times++;
				assert.equal(element, 'grandfather');
			});

			return model.refresh('grandfather').then(() => {
				assert.equal(times, 1);
				listener.dispose();

				listener = dataModel.onGetChildren((element) => {
					times++;
					assert.equal(element, 'father');
				});

				return model.expand('father').then(() => {
					assert.equal(times, 2);
					listener.dispose();
				});
			});
		});
	});

	test('simultaneously refreshing two disjoint elements should parallelize the refreshes', () => {
		dataModel.addChild('root', 'father');
		dataModel.addChild('root', 'mother');
		dataModel.addChild('father', 'son');
		dataModel.addChild('mother', 'daughter');

		return model.setInput('root').then(() => {
			model.expand('father');
			model.expand('mother');

			var nav = model.getNavigator();
			assert.equal(nav.next().id, 'father');
			assert.equal(nav.next().id, 'son');
			assert.equal(nav.next().id, 'mother');
			assert.equal(nav.next().id, 'daughter');
			assert.equal(nav.next() && false, null);

			dataModel.removeChild('father', 'son');
			dataModel.removeChild('mother', 'daughter');
			dataModel.addChild('father', 'brother');
			dataModel.addChild('mother', 'sister');

			dataModel.promiseFactory = () => { return WinJS.TPromise.timeout(0); };

			var getTimes = 0;
			var gotTimes = 0;
			var getListener = dataModel.onGetChildren((element) => { getTimes++; });
			var gotListener = dataModel.onDidGetChildren((element) => { gotTimes++; });

			var p1 = model.refresh('father');
			assert.equal(getTimes, 1);
			assert.equal(gotTimes, 0);

			var p2 = model.refresh('mother');
			assert.equal(getTimes, 2);
			assert.equal(gotTimes, 0);

			return WinJS.Promise.join([p1, p2]).then(() => {
				assert.equal(getTimes, 2);
				assert.equal(gotTimes, 2);

				nav = model.getNavigator();
				assert.equal(nav.next().id, 'father');
				assert.equal(nav.next().id, 'brother');
				assert.equal(nav.next().id, 'mother');
				assert.equal(nav.next().id, 'sister');
				assert.equal(nav.next() && false, null);

				getListener.dispose();
				gotListener.dispose();
			});
		});
	});

	test('simultaneously recursively refreshing two intersecting elements should concatenate the refreshes - ancestor first', () => {
		dataModel.addChild('root', 'grandfather');
		dataModel.addChild('grandfather', 'father');
		dataModel.addChild('father', 'son');

		return model.setInput('root').then(() => {
			model.expand('grandfather');
			model.expand('father');

			var nav = model.getNavigator();
			assert.equal(nav.next().id, 'grandfather');
			assert.equal(nav.next().id, 'father');
			assert.equal(nav.next().id, 'son');
			assert.equal(nav.next() && false, null);

			var refreshTimes = 0;
			counter.listen(model.onDidRefreshItem, (e) => { refreshTimes++; });

			var getTimes = 0;
			var getListener = dataModel.onGetChildren((element) => { getTimes++; });

			var gotTimes = 0;
			var gotListener = dataModel.onDidGetChildren((element) => { gotTimes++; });

			var p1Completes = [];
			dataModel.promiseFactory = () => { return new WinJS.TPromise((c) => { p1Completes.push(c); }); };

			model.refresh('grandfather');

			// just a single get
			assert.equal(refreshTimes, 1); // (+1) grandfather
			assert.equal(getTimes, 1);
			assert.equal(gotTimes, 0);

			// unblock the first get
			p1Completes.shift()();

			// once the first get is unblocked, the second get should appear
			assert.equal(refreshTimes, 2); // (+1) first father refresh
			assert.equal(getTimes, 2);
			assert.equal(gotTimes, 1);

			var p2Complete;
			dataModel.promiseFactory = () => { return new WinJS.TPromise((c) => { p2Complete = c; }); };
			var p2 = model.refresh('father');

			// same situation still
			assert.equal(refreshTimes, 3); // (+1) second father refresh
			assert.equal(getTimes, 2);
			assert.equal(gotTimes, 1);

			// unblock the second get
			p1Completes.shift()();

			// the third get should have appeared, it should've been waiting for the second one
			assert.equal(refreshTimes, 4); // (+1) first son request
			assert.equal(getTimes, 3);
			assert.equal(gotTimes, 2);

			p2Complete();

			// all good
			assert.equal(refreshTimes, 5); // (+1) second son request
			assert.equal(getTimes, 3);
			assert.equal(gotTimes, 3);

			return p2.then(() => {
				nav = model.getNavigator();
				assert.equal(nav.next().id, 'grandfather');
				assert.equal(nav.next().id, 'father');
				assert.equal(nav.next().id, 'son');
				assert.equal(nav.next() && false, null);

				getListener.dispose();
				gotListener.dispose();
			});
		});
	});

	test('simultaneously recursively refreshing two intersecting elements should concatenate the refreshes - ancestor second', () => {
		dataModel.addChild('root', 'grandfather');
		dataModel.addChild('grandfather', 'father');
		dataModel.addChild('father', 'son');

		return model.setInput('root').then(() => {
			model.expand('grandfather');
			model.expand('father');

			var nav = model.getNavigator();
			assert.equal(nav.next().id, 'grandfather');
			assert.equal(nav.next().id, 'father');
			assert.equal(nav.next().id, 'son');
			assert.equal(nav.next() && false, null);

			var getTimes = 0;
			var gotTimes = 0;
			var getListener = dataModel.onGetChildren((element) => { getTimes++; });
			var gotListener = dataModel.onDidGetChildren((element) => { gotTimes++; });
			var p2;

			var p1Complete;
			dataModel.promiseFactory = () => { return new WinJS.TPromise((c) => { p1Complete = c; }); };

			model.refresh('father');

			assert.equal(getTimes, 1);
			assert.equal(gotTimes, 0);

			var p2Completes = [];
			dataModel.promiseFactory = () => { return new WinJS.TPromise((c) => { p2Completes.push(c); }); };
			p2 = model.refresh('grandfather');

			assert.equal(getTimes, 1);
			assert.equal(gotTimes, 0);

			p1Complete();

			assert.equal(getTimes, 2);
			assert.equal(gotTimes, 1);

			p2Completes.shift()();

			assert.equal(getTimes, 3);
			assert.equal(gotTimes, 2);

			p2Completes.shift()();

			assert.equal(getTimes, 3);
			assert.equal(gotTimes, 3);

			return p2.then(() => {
				nav = model.getNavigator();
				assert.equal(nav.next().id, 'grandfather');
				assert.equal(nav.next().id, 'father');
				assert.equal(nav.next().id, 'son');
				assert.equal(nav.next() && false, null);

				getListener.dispose();
				gotListener.dispose();
			});
		});
	});

	test('refreshing an empty element that adds children should still keep it collapsed', () => {
		dataModel.addChild('root', 'grandfather');
		dataModel.addChild('grandfather', 'father');

		return model.setInput('root').then(() => {
			model.expand('grandfather');
			model.expand('father');

			assert(!model.isExpanded('father'));

			dataModel.addChild('father', 'son');

			return model.refresh('father').then(() => {
				assert(!model.isExpanded('father'));
			});
		});
	});

	test('refreshing a collapsed element that adds children should still keep it collapsed', () => {
		dataModel.addChild('root', 'grandfather');
		dataModel.addChild('grandfather', 'father');
		dataModel.addChild('father', 'son');

		return model.setInput('root').then(() => {
			model.expand('grandfather');
			model.expand('father');
			model.collapse('father');

			assert(!model.isExpanded('father'));

			dataModel.addChild('father', 'daughter');

			return model.refresh('father').then(() => {
				assert(!model.isExpanded('father'));
			});
		});
	});

	test('recursively refreshing an ancestor of an expanded element, should keep that element expanded', () => {
		dataModel.addChild('root', 'grandfather');
		dataModel.addChild('grandfather', 'father');
		dataModel.addChild('father', 'son');

		return model.setInput('root').then(() => {
			model.expand('grandfather');
			model.expand('father');

			assert(model.isExpanded('grandfather'));
			assert(model.isExpanded('father'));

			return model.refresh('grandfather').then(() => {
				assert(model.isExpanded('grandfather'));
				assert(model.isExpanded('father'));
			});
		});
	});

	test('recursively refreshing an ancestor of a collapsed element, should keep that element collapsed', () => {
		dataModel.addChild('root', 'grandfather');
		dataModel.addChild('grandfather', 'father');
		dataModel.addChild('father', 'son');

		return model.setInput('root').then(() => {
			model.expand('grandfather');
			model.expand('father');
			model.collapse('father');

			assert(model.isExpanded('grandfather'));
			assert(!model.isExpanded('father'));

			return model.refresh('grandfather').then(() => {
				assert(model.isExpanded('grandfather'));
				assert(!model.isExpanded('father'));
			});
		});
	});

	test('Bug 10855:[explorer] quickly deleting things causes NPE in tree - intersectsLock should always be called when trying to unlock', () => {
		dataModel.addChild('root', 'father');
		dataModel.addChild('father', 'son');
		dataModel.addChild('root', 'mother');
		dataModel.addChild('mother', 'daughter');

		return model.setInput('root').then(() => {

			// delay expansions and refreshes
			dataModel.promiseFactory = () => { return WinJS.TPromise.timeout(0); };

			var promises: WinJS.Promise[] = [];

			promises.push(model.expand('father'));
			dataModel.removeChild('root', 'father');
			promises.push(model.refresh('root'));

			promises.push(model.expand('mother'));
			dataModel.removeChild('root', 'mother');
			promises.push(model.refresh('root'));

			return WinJS.Promise.join(promises).then(() => {
				assert(true, 'all good');
			}, (errs) => {
				assert(false, 'should not fail');
			});
		});
	});
});

suite('TreeModel - bugs', () => {
	var counter: EventCounter;

	setup(() => {
		counter = new EventCounter();
	});

	teardown(() => {
		counter.dispose();
	});

	/**
	 * This bug occurs when an item is expanded right during its removal
	 */
	test('Bug 10566:[tree] build viewlet is broken after some time', () => {
		// setup
		let model = new TreeModel({
			dataSource: {
				getId: (_, e) => e,
				hasChildren: (_, e) => e === 'root' || e === 'bart',
				getChildren: (_, e) => {
					if (e === 'root') { return getRootChildren(); }
					if (e === 'bart') { return getBartChildren(); }
					return WinJS.TPromise.as([]);
				},
				getParent: (_, e): WinJS.Promise => { throw new Error('not implemented'); },
			}
		});

		let listeners = <any>[];

		// helpers
		var getGetRootChildren = (children: string[], timeout = 0) => () => WinJS.TPromise.timeout(timeout).then(() => children);
		var getRootChildren = getGetRootChildren(['homer', 'bart', 'lisa', 'marge', 'maggie'], 0);
		var getGetBartChildren = (timeout = 0) => () => WinJS.TPromise.timeout(timeout).then(() => ['milhouse', 'nelson']);
		var getBartChildren = getGetBartChildren(0);

		// item expanding should not exist!
		counter.listen(model.onExpandItem, () => { assert(false, 'should never receive item:expanding event'); });
		counter.listen(model.onDidExpandItem, () => { assert(false, 'should never receive item:expanded event'); });

		return model.setInput('root').then(() => {

			// remove bart
			getRootChildren = getGetRootChildren(['homer', 'lisa', 'marge', 'maggie'], 10);

			// refresh root
			var p1 = model.refresh('root', true).then(() => {
				assert(true);
			}, () => {
				assert(false, 'should never reach this');
			});

			// at the same time, try to expand bart!
			var p2 = model.expand('bart').then(() => {
				assert(false, 'should never reach this');
			}, () => {
				assert(true, 'bart should fail to expand since he was removed meanwhile');
			});

			// what now?
			return WinJS.Promise.join([p1, p2]);

		}).then(() => {

			// teardown
			while (listeners.length > 0) { listeners.pop()(); }
			listeners = null;
			model.dispose();
			model = null;

			assert.equal(counter.count, 0);
		});
	});
});
