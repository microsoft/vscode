/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import { config } from '../electron.ts';

suite('Electron Darwin bundle document icon paths', () => {
	test('darwinBundleDocumentTypes iconFile paths use lowercase basenames for case-sensitive volumes (#129665)', () => {
		for (const docType of config.darwinBundleDocumentTypes) {
			const { iconFile } = docType;
			assert.ok(iconFile.startsWith('resources/darwin/'), iconFile);
			assert.ok(iconFile.endsWith('.icns'), iconFile);
			const base = path.basename(iconFile, '.icns');
			assert.strictEqual(base, base.toLowerCase(), `icon basename must be lowercase: ${iconFile}`);
		}
	});
});
