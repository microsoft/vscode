/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { Builder } from 'vs/base/browser/builder';

suite('ProgressBar', () => {
	let fixture: HTMLElement;

	setup(() => {
		fixture = document.createElement('div');
		document.body.appendChild(fixture);
	});

	teardown(() => {
		document.body.removeChild(fixture);
	});

	test('Progress Bar', function () {
		const b = new Builder(fixture);

		const bar = new ProgressBar(b);
		assert(bar.getContainer());
		assert(bar.infinite());
		assert(bar.total(100));
		assert(bar.worked(50));
		assert(bar.worked(50));
		assert(bar.done());

		bar.dispose();
	});
});