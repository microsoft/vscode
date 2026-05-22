/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint no-unreachable: "off" */
/* eslint no-fallthrough: "error" */
export function fallthrough(paths: string[]) {
	switch (paths.length) {
		case 0:
			console.log("warning: possible mistake, no paths provided.");
		case 1:
		case 2:
			return "ok";
		default:
			return "too many paths";
	}
}