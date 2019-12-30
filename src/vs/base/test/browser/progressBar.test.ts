/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';

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
		const bar = new ProgressBar(fixture);
		assert(bar.infinite());
		assert(bar.total(100));
		assert(bar.worked(50));
		assert(bar.setWorked(70));
		assert(bar.worked(30));
		assert(bar.done());

		bar.dispose();
	});
});
