/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

const schemes = ['OSS', 'INSIDERS', 'STABLE', 'EXPLORATION', 'VSO', 'VSO_PPE', 'VSO_DEV'];

function main() {
	let content = {};

	for (const scheme of schemes) {
		const id = process.env[`${scheme}_GITHUB_ID`];
		const secret = process.env[`${scheme}_GITHUB_SECRET`];

		if (id && secret) {
			content[scheme] = { id, secret };
		}
	}

	const githubAppId = process.env.GITHUB_APP_ID;
	const githubAppSecret = process.env.GITHUB_APP_SECRET;

	if (githubAppId && githubAppSecret) {
		content.GITHUB_APP = { id: githubAppId, secret: githubAppSecret }
	}

	if (Object.keys(content).length > 0) {
		fs.writeFileSync(path.join(__dirname, '../src/common/config.json'), JSON.stringify(content));
	}
}

main();
