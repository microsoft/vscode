/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { QuickOpenModel, QuickOpenEntry, QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { DataSource } from 'vs/base/parts/quickopen/browser/quickOpenViewer';

suite('QuickOpen', () => {
	test('QuickOpenModel', () => {
		const model = new QuickOpenModel();

		const entry1 = new QuickOpenEntry();
		const entry2 = new QuickOpenEntry();
		const entry3 = new QuickOpenEntryGroup();

		assert.notEqual(entry1.getId(), entry2.getId());
		assert.notEqual(entry2.getId(), entry3.getId());

		model.addEntries([entry1, entry2, entry3]);
		assert.equal(3, model.getEntries().length);

		model.setEntries([entry1, entry2]);
		assert.equal(2, model.getEntries().length);

		entry1.setHidden(true);
		assert.equal(1, model.getEntries(true).length);
		assert.equal(entry2, model.getEntries(true)[0]);
	});

	test('QuickOpenDataSource', () => {
		const model = new QuickOpenModel();

		const entry1 = new QuickOpenEntry();
		const entry2 = new QuickOpenEntry();
		const entry3 = new QuickOpenEntryGroup();

		model.addEntries([entry1, entry2, entry3]);

		const ds = new DataSource(model);
		assert.equal(entry1.getId(), ds.getId(null, entry1));
		assert.equal(true, ds.hasChildren(null, model));
		assert.equal(false, ds.hasChildren(null, entry1));

		ds.getChildren(null, model).then((children: any[]) => {
			assert.equal(3, children.length);
		});
	});
});