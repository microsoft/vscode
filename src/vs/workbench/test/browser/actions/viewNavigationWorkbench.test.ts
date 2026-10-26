/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { resolveViewNavigationTarget } from '../../../browser/actions/viewNavigationModel.js';
import { standardSnapshot } from './viewNavigationFixtures.js';

suite('Workbench view navigation: workbench focus matrix', () => {
	test("workbench: next from a (wrap) goes to b", () => {
		const snapshot = standardSnapshot("a");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "b");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from a (no wrap) goes to b", () => {
		const snapshot = standardSnapshot("a");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "b");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from a (wrap) goes to g", () => {
		const snapshot = standardSnapshot("a");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from a (no wrap) goes to none", () => {
		const snapshot = standardSnapshot("a");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: false
		});
		assert.strictEqual(result?.viewId, undefined);
		assert.strictEqual(result?.containerId, undefined);
		assert.strictEqual(result?.index, undefined);
		assert.strictEqual(result?.total, undefined);
	});

	test("workbench: first from a (wrap) goes to a", () => {
		const snapshot = standardSnapshot("a");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from a (no wrap) goes to a", () => {
		const snapshot = standardSnapshot("a");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from a (wrap) goes to g", () => {
		const snapshot = standardSnapshot("a");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from a (no wrap) goes to g", () => {
		const snapshot = standardSnapshot("a");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from b (wrap) goes to c", () => {
		const snapshot = standardSnapshot("b");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "c");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from b (no wrap) goes to c", () => {
		const snapshot = standardSnapshot("b");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "c");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from b (wrap) goes to a", () => {
		const snapshot = standardSnapshot("b");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from b (no wrap) goes to a", () => {
		const snapshot = standardSnapshot("b");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from b (wrap) goes to a", () => {
		const snapshot = standardSnapshot("b");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from b (no wrap) goes to a", () => {
		const snapshot = standardSnapshot("b");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from b (wrap) goes to g", () => {
		const snapshot = standardSnapshot("b");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from b (no wrap) goes to g", () => {
		const snapshot = standardSnapshot("b");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from c (wrap) goes to d", () => {
		const snapshot = standardSnapshot("c");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "d");
		assert.strictEqual(result?.containerId, "auxiliary");
		assert.strictEqual(result?.index, 3);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from c (no wrap) goes to d", () => {
		const snapshot = standardSnapshot("c");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "d");
		assert.strictEqual(result?.containerId, "auxiliary");
		assert.strictEqual(result?.index, 3);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from c (wrap) goes to b", () => {
		const snapshot = standardSnapshot("c");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "b");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from c (no wrap) goes to b", () => {
		const snapshot = standardSnapshot("c");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "b");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from c (wrap) goes to a", () => {
		const snapshot = standardSnapshot("c");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from c (no wrap) goes to a", () => {
		const snapshot = standardSnapshot("c");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from c (wrap) goes to g", () => {
		const snapshot = standardSnapshot("c");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from c (no wrap) goes to g", () => {
		const snapshot = standardSnapshot("c");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from d (wrap) goes to e", () => {
		const snapshot = standardSnapshot("d");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "e");
		assert.strictEqual(result?.containerId, "auxiliary");
		assert.strictEqual(result?.index, 4);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from d (no wrap) goes to e", () => {
		const snapshot = standardSnapshot("d");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "e");
		assert.strictEqual(result?.containerId, "auxiliary");
		assert.strictEqual(result?.index, 4);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from d (wrap) goes to c", () => {
		const snapshot = standardSnapshot("d");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "c");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from d (no wrap) goes to c", () => {
		const snapshot = standardSnapshot("d");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "c");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from d (wrap) goes to a", () => {
		const snapshot = standardSnapshot("d");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from d (no wrap) goes to a", () => {
		const snapshot = standardSnapshot("d");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from d (wrap) goes to g", () => {
		const snapshot = standardSnapshot("d");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from d (no wrap) goes to g", () => {
		const snapshot = standardSnapshot("d");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from e (wrap) goes to f", () => {
		const snapshot = standardSnapshot("e");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "f");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 5);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from e (no wrap) goes to f", () => {
		const snapshot = standardSnapshot("e");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "f");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 5);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from e (wrap) goes to d", () => {
		const snapshot = standardSnapshot("e");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "d");
		assert.strictEqual(result?.containerId, "auxiliary");
		assert.strictEqual(result?.index, 3);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from e (no wrap) goes to d", () => {
		const snapshot = standardSnapshot("e");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "d");
		assert.strictEqual(result?.containerId, "auxiliary");
		assert.strictEqual(result?.index, 3);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from e (wrap) goes to a", () => {
		const snapshot = standardSnapshot("e");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from e (no wrap) goes to a", () => {
		const snapshot = standardSnapshot("e");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from e (wrap) goes to g", () => {
		const snapshot = standardSnapshot("e");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from e (no wrap) goes to g", () => {
		const snapshot = standardSnapshot("e");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from f (wrap) goes to g", () => {
		const snapshot = standardSnapshot("f");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from f (no wrap) goes to g", () => {
		const snapshot = standardSnapshot("f");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from f (wrap) goes to e", () => {
		const snapshot = standardSnapshot("f");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "e");
		assert.strictEqual(result?.containerId, "auxiliary");
		assert.strictEqual(result?.index, 4);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from f (no wrap) goes to e", () => {
		const snapshot = standardSnapshot("f");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "e");
		assert.strictEqual(result?.containerId, "auxiliary");
		assert.strictEqual(result?.index, 4);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from f (wrap) goes to a", () => {
		const snapshot = standardSnapshot("f");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from f (no wrap) goes to a", () => {
		const snapshot = standardSnapshot("f");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from f (wrap) goes to g", () => {
		const snapshot = standardSnapshot("f");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from f (no wrap) goes to g", () => {
		const snapshot = standardSnapshot("f");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from g (wrap) goes to a", () => {
		const snapshot = standardSnapshot("g");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: next from g (no wrap) goes to none", () => {
		const snapshot = standardSnapshot("g");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "next",
			wrap: false
		});
		assert.strictEqual(result?.viewId, undefined);
		assert.strictEqual(result?.containerId, undefined);
		assert.strictEqual(result?.index, undefined);
		assert.strictEqual(result?.total, undefined);
	});

	test("workbench: previous from g (wrap) goes to f", () => {
		const snapshot = standardSnapshot("g");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "f");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 5);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: previous from g (no wrap) goes to f", () => {
		const snapshot = standardSnapshot("g");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "previous",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "f");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 5);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from g (wrap) goes to a", () => {
		const snapshot = standardSnapshot("g");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: first from g (no wrap) goes to a", () => {
		const snapshot = standardSnapshot("g");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "first",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "a");
		assert.strictEqual(result?.containerId, "explorer");
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from g (wrap) goes to g", () => {
		const snapshot = standardSnapshot("g");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: true
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});

	test("workbench: last from g (no wrap) goes to g", () => {
		const snapshot = standardSnapshot("g");
		const result = resolveViewNavigationTarget(snapshot, {
			scope: "workbench",
			direction: "last",
			wrap: false
		});
		assert.strictEqual(result?.viewId, "g");
		assert.strictEqual(result?.containerId, "problems");
		assert.strictEqual(result?.index, 6);
		assert.strictEqual(result?.total, 7);
	});
});
