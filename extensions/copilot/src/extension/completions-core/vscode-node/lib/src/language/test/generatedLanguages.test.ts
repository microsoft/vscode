/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { knownLanguages } from '../generatedLanguages';
import { languageMarkers } from '../../../../prompt/src/languageMarker';
import * as assert from 'assert';

suite('generated languages', function () {
	// tex exists as latex and tex in language markers
	// jsx exists as jsx and javascriptreact in language markers. However jsx is never detected according to telemetry data
	// vue-html will be detected as html
	const ignoredMappings = ['jsx', 'tex', 'vue-html'];

	for (const marker in languageMarkers) {
		if (!ignoredMappings.includes(marker)) {
			test(`'${marker}' is generated`, function () {
				assert.ok(
					marker in knownLanguages,
					'language for comment marker ' + marker + ' has not been generated'
				);
			});
		}
	}
});
