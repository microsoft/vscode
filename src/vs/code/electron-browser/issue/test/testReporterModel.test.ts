/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IssueReporterModel } from 'vs/code/electron-browser/issue/issueReporterModel';

suite('IssueReporter', () => {

	test('sets defaults to include all data', () => {
		const issueReporterModel = new IssueReporterModel();
		assert.deepEqual(issueReporterModel.getData(), {
			includeSystemInfo: true,
			includeWorkspaceInfo: true,
			includeProcessInfo: true,
			includeExtensions: true,
			includeSearchedExtensions: true,
			includeSettingsSearchDetails: true,
			reprosWithoutExtensions: false
		});
	});

	test('serializes model skeleton when no data is provided', () => {
		const issueReporterModel = new IssueReporterModel();
		assert.equal(issueReporterModel.serialize(),
			`
### Issue Type
Feature Request

### Description

undefined

### VS Code Info

VS Code version: undefined
OS version: undefined

`);
	});
});
