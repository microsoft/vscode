/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DEFAULT_PANE_HEADER_SIZE, Pane, setGlobalPaneHeaderSize } from '../../../../browser/ui/splitview/paneview.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

class TestPane extends Pane {

	lastLayout: { height: number; width: number } | undefined;

	constructor() {
		super({ title: 'Test', minimumBodySize: 10, maximumBodySize: 100 });
		this.render();
	}

	protected renderHeader(container: HTMLElement): void { }
	protected renderBody(container: HTMLElement): void { }

	protected layoutBody(height: number, width: number): void {
		this.lastLayout = { height, width };
	}
}

suite('Paneview', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => setGlobalPaneHeaderSize(DEFAULT_PANE_HEADER_SIZE));

	test('uses the global pane header size', () => {
		const pane = store.add(new TestPane());
		pane.orthogonalSize = 200;

		const defaultSizes = { minimumSize: pane.minimumSize, maximumSize: pane.maximumSize };
		pane.layout(50);
		const defaultLayout = pane.lastLayout;

		setGlobalPaneHeaderSize(28);

		const overrideSizes = { minimumSize: pane.minimumSize, maximumSize: pane.maximumSize };
		pane.layout(50);

		assert.deepStrictEqual({
			defaultSizes,
			defaultLayout,
			overrideSizes,
			overrideLayout: pane.lastLayout,
		}, {
			defaultSizes: { minimumSize: 32, maximumSize: 122 },
			defaultLayout: { height: 28, width: 200 },
			overrideSizes: { minimumSize: 38, maximumSize: 128 },
			overrideLayout: { height: 22, width: 200 },
		});
	});
});
