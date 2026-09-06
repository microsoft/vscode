/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint require-await: "error" */
import fs = require("node:fs")
/** look in location if provided, otherwise look in the home directory */
export async function readConfig(location?: string) {
	if (!location) {
		location = "~/.config/program/.default";
	}
	const s = fs.readFileSync(location, 'utf8')
	return JSON.parse(s)
}