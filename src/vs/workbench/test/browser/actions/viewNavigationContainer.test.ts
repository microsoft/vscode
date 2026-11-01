/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { resolveViewNavigationTarget } from '../../../browser/actions/viewNavigationModel.js';
import { standardSnapshot } from './viewNavigationFixtures.js';

suite('Workbench view navigation: container focus matrix', () => {
	test('container: next from a (wrap) goes to b', () => {
		const snapshot = standardSnapshot('a');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'b');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 3);
	});

	test('container: next from a (no wrap) goes to b', () => {
		const snapshot = standardSnapshot('a');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'b');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 3);
	});

	test('container: previous from a (wrap) goes to c', () => {
		const snapshot = standardSnapshot('a');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'c');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 3);
	});

	test('container: previous from a (no wrap) goes to none', () => {
		const snapshot = standardSnapshot('a');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: false
		});
		assert.strictEqual(result?.viewId, undefined);
		assert.strictEqual(result?.containerId, undefined);
		assert.strictEqual(result?.index, undefined);
		assert.strictEqual(result?.total, undefined);
	});

	test('container: first from a (wrap) goes to a', () => {
		const snapshot = standardSnapshot('a');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'a');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 3);
	});

	test('container: first from a (no wrap) goes to a', () => {
		const snapshot = standardSnapshot('a');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'a');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 3);
	});

	test('container: last from a (wrap) goes to c', () => {
		const snapshot = standardSnapshot('a');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'c');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 3);
	});

	test('container: last from a (no wrap) goes to c', () => {
		const snapshot = standardSnapshot('a');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'c');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 3);
	});

	test('container: next from b (wrap) goes to c', () => {
		const snapshot = standardSnapshot('b');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'c');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 3);
	});

	test('container: next from b (no wrap) goes to c', () => {
		const snapshot = standardSnapshot('b');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'c');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 3);
	});

	test('container: previous from b (wrap) goes to a', () => {
		const snapshot = standardSnapshot('b');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'a');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 3);
	});

	test('container: previous from b (no wrap) goes to a', () => {
		const snapshot = standardSnapshot('b');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'a');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 3);
	});

	test('container: first from b (wrap) goes to a', () => {
		const snapshot = standardSnapshot('b');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'a');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 3);
	});

	test('container: first from b (no wrap) goes to a', () => {
		const snapshot = standardSnapshot('b');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'a');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 3);
	});

	test('container: last from b (wrap) goes to c', () => {
		const snapshot = standardSnapshot('b');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'c');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 3);
	});

	test('container: last from b (no wrap) goes to c', () => {
		const snapshot = standardSnapshot('b');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'c');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 3);
	});

	test('container: next from c (wrap) goes to a', () => {
		const snapshot = standardSnapshot('c');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'a');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 3);
	});

	test('container: next from c (no wrap) goes to none', () => {
		const snapshot = standardSnapshot('c');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: false
		});
		assert.strictEqual(result?.viewId, undefined);
		assert.strictEqual(result?.containerId, undefined);
		assert.strictEqual(result?.index, undefined);
		assert.strictEqual(result?.total, undefined);
	});

	test('container: previous from c (wrap) goes to b', () => {
		const snapshot = standardSnapshot('c');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'b');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 3);
	});

	test('container: previous from c (no wrap) goes to b', () => {
		const snapshot = standardSnapshot('c');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'b');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 3);
	});

	test('container: first from c (wrap) goes to a', () => {
		const snapshot = standardSnapshot('c');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'a');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 3);
	});

	test('container: first from c (no wrap) goes to a', () => {
		const snapshot = standardSnapshot('c');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'a');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 3);
	});

	test('container: last from c (wrap) goes to c', () => {
		const snapshot = standardSnapshot('c');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'c');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 3);
	});

	test('container: last from c (no wrap) goes to c', () => {
		const snapshot = standardSnapshot('c');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'c');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.index, 2);
		assert.strictEqual(result?.total, 3);
	});

	test('container: next from d (wrap) goes to e', () => {
		const snapshot = standardSnapshot('d');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'e');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: next from d (no wrap) goes to e', () => {
		const snapshot = standardSnapshot('d');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'e');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: previous from d (wrap) goes to e', () => {
		const snapshot = standardSnapshot('d');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'e');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: previous from d (no wrap) goes to none', () => {
		const snapshot = standardSnapshot('d');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: false
		});
		assert.strictEqual(result?.viewId, undefined);
		assert.strictEqual(result?.containerId, undefined);
		assert.strictEqual(result?.index, undefined);
		assert.strictEqual(result?.total, undefined);
	});

	test('container: first from d (wrap) goes to d', () => {
		const snapshot = standardSnapshot('d');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'd');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: first from d (no wrap) goes to d', () => {
		const snapshot = standardSnapshot('d');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'd');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: last from d (wrap) goes to e', () => {
		const snapshot = standardSnapshot('d');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'e');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: last from d (no wrap) goes to e', () => {
		const snapshot = standardSnapshot('d');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'e');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: next from e (wrap) goes to d', () => {
		const snapshot = standardSnapshot('e');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'd');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: next from e (no wrap) goes to none', () => {
		const snapshot = standardSnapshot('e');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: false
		});
		assert.strictEqual(result?.viewId, undefined);
		assert.strictEqual(result?.containerId, undefined);
		assert.strictEqual(result?.index, undefined);
		assert.strictEqual(result?.total, undefined);
	});

	test('container: previous from e (wrap) goes to d', () => {
		const snapshot = standardSnapshot('e');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'd');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: previous from e (no wrap) goes to d', () => {
		const snapshot = standardSnapshot('e');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'd');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: first from e (wrap) goes to d', () => {
		const snapshot = standardSnapshot('e');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'd');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: first from e (no wrap) goes to d', () => {
		const snapshot = standardSnapshot('e');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'd');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: last from e (wrap) goes to e', () => {
		const snapshot = standardSnapshot('e');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'e');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: last from e (no wrap) goes to e', () => {
		const snapshot = standardSnapshot('e');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'e');
		assert.strictEqual(result?.containerId, 'auxiliary');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: next from f (wrap) goes to g', () => {
		const snapshot = standardSnapshot('f');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'g');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: next from f (no wrap) goes to g', () => {
		const snapshot = standardSnapshot('f');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'g');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: previous from f (wrap) goes to g', () => {
		const snapshot = standardSnapshot('f');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'g');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: previous from f (no wrap) goes to none', () => {
		const snapshot = standardSnapshot('f');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: false
		});
		assert.strictEqual(result?.viewId, undefined);
		assert.strictEqual(result?.containerId, undefined);
		assert.strictEqual(result?.index, undefined);
		assert.strictEqual(result?.total, undefined);
	});

	test('container: first from f (wrap) goes to f', () => {
		const snapshot = standardSnapshot('f');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'f');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: first from f (no wrap) goes to f', () => {
		const snapshot = standardSnapshot('f');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'f');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: last from f (wrap) goes to g', () => {
		const snapshot = standardSnapshot('f');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'g');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: last from f (no wrap) goes to g', () => {
		const snapshot = standardSnapshot('f');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'g');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: next from g (wrap) goes to f', () => {
		const snapshot = standardSnapshot('g');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'f');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: next from g (no wrap) goes to none', () => {
		const snapshot = standardSnapshot('g');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'next',
			wrap: false
		});
		assert.strictEqual(result?.viewId, undefined);
		assert.strictEqual(result?.containerId, undefined);
		assert.strictEqual(result?.index, undefined);
		assert.strictEqual(result?.total, undefined);
	});

	test('container: previous from g (wrap) goes to f', () => {
		const snapshot = standardSnapshot('g');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'f');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: previous from g (no wrap) goes to f', () => {
		const snapshot = standardSnapshot('g');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'previous',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'f');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: first from g (wrap) goes to f', () => {
		const snapshot = standardSnapshot('g');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'f');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: first from g (no wrap) goes to f', () => {
		const snapshot = standardSnapshot('g');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'first',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'f');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 0);
		assert.strictEqual(result?.total, 2);
	});

	test('container: last from g (wrap) goes to g', () => {
		const snapshot = standardSnapshot('g');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: true
		});
		assert.strictEqual(result?.viewId, 'g');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('container: last from g (no wrap) goes to g', () => {
		const snapshot = standardSnapshot('g');
		const result = resolveViewNavigationTarget(snapshot, {
			scope: 'container',
			direction: 'last',
			wrap: false
		});
		assert.strictEqual(result?.viewId, 'g');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});
});
