/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import beautifyHtml = require('vs/languages/lib/common/beautify-html');

function mock_html_beautify(value:string, options:beautifyHtml.IBeautifyHTMLOptions): string {
	return value;
}

var mock: typeof beautifyHtml = {
	html_beautify: mock_html_beautify
};
export = mock;