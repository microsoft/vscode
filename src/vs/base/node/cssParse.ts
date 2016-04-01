/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// TODO add to loader somehow?
const rework = <any>require.__$__nodeRequire('rework');
const reworkUrl = <any>require.__$__nodeRequire('rework-plugin-url');

export function parseCssString(cssSource: string, rebaseUrlsDir: string): any {
	return rework(cssSource).use(
	// rebase url's to the theme extension path
	reworkUrl(url => `${rebaseUrlsDir}/` + url)
	);
}