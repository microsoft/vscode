/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const cp = require('child_process');
const path = require('path');


fs.readdirSync(__dirname).forEach(function (file) {
	const match = file.match(/^(\d\d-\w+)-[^.]+$/);
	if (match) {

		const originalName = match[1];
		const diffName = `${file}.diff`;
		try {
			console.log(`Updating ${diffName}`);
			cp.execFileSync(`git`, [`diff`, `--no-index`, `--relative`, `--output=${diffName}`, '--', originalName, file]);
		} catch (e) {
		}
	}
});