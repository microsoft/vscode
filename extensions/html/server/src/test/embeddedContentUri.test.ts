/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {getEmbeddedContentUri, getEmbeddedLanguageId, getHostDocumentUri, isEmbeddedContentUri} from './embeddedContentUri';

suite('Embedded URI', () => {

	test('URI', function (): any {
		let resourceUri1 = 'file:///c%3A/workspaces/samples/foo.html';
		let resourceUri2 = 'file://Users/joe/samples/foo.html';

		let uri = getEmbeddedContentUri(resourceUri1, 'css');
		assert(isEmbeddedContentUri(uri));
		assert.equal(getEmbeddedLanguageId(uri), 'css');
		assert.equal(getHostDocumentUri(uri), resourceUri1);

		let uri2 = getEmbeddedContentUri(resourceUri2, 'css');
		assert(isEmbeddedContentUri(uri2));
		assert.equal(getEmbeddedLanguageId(uri2), 'css');
		assert.equal(getHostDocumentUri(uri2), resourceUri2);
	});

});