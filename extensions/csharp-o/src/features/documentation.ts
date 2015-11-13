/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


var _regExp = /<(\S*?).*?>((.|\r|\n)*?)<\/\1>/;

/**
 * remove xml-tags from string
 */
export function plain(doc: string): string {

	if (!doc) {
		return doc;
	}

	var newDoc: string;

	while (true) {
		newDoc = doc.replace(_regExp,(m, g1, g2, g3) => g2);
		if (newDoc === doc) {
			break;
		}
		doc = newDoc;
	}

	return newDoc;
}
