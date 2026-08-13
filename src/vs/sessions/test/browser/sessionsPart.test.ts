/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SessionsPart } from '../../browser/parts/sessionsPart.js';

interface IViewSize {
	readonly width: number;
	readonly height: number;
}

suite('Sessions - Sessions Part', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const restoreSessionOnActivation = Reflect.get(SessionsPart.prototype, '_restoreSessionOnActivation') as (this: {
		_gridWidget: {
			getViewSize(view: object): IViewSize;
			expandView(view: object): void;
		} | undefined;
	}, view: { readonly minimumWidth: number }) => void;

	test('expands a session only when activated at minimum width', () => {
		const minimizedView = { minimumWidth: 200 };
		const expandedView = { minimumWidth: 200 };
		const expanded: object[] = [];
		const host = {
			_gridWidget: {
				getViewSize: (view: object) => ({ width: view === minimizedView ? 200 : 201, height: 600 }),
				expandView: (view: object) => expanded.push(view),
			}
		};

		restoreSessionOnActivation.call(host, minimizedView);
		restoreSessionOnActivation.call(host, expandedView);

		assert.deepStrictEqual(expanded, [minimizedView]);
	});
});
