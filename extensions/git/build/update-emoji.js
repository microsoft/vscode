/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const https = require('https');
const path = require('path');

async function generate() {
	/**
	 * @type {Map<string, string>}
	 */
	const shortcodeMap = new Map();

	// Get emoji data from https://github.com/milesj/emojibase
	// https://github.com/milesj/emojibase/

	const files = ['github.raw.json'] //, 'emojibase.raw.json']; //, 'iamcal.raw.json', 'joypixels.raw.json'];

	for (const file of files) {
		await download(
			`https://raw.githubusercontent.com/milesj/emojibase/master/packages/data/en/shortcodes/${file}`,
			file,
		);

		/**
		 * @type {Record<string, string | string[]>}}
		 */
		// eslint-disable-next-line import/no-dynamic-require
		const data = require(path.join(process.cwd(), file));
		for (const [emojis, codes] of Object.entries(data)) {
			const emoji = emojis
				.split('-')
				.map(c => String.fromCodePoint(parseInt(c, 16)))
				.join('');
			for (const code of Array.isArray(codes) ? codes : [codes]) {
				if (shortcodeMap.has(code)) {
					// console.warn(`${file}: ${code}`);
					continue;
				}
				shortcodeMap.set(code, emoji);
			}
		}

		fs.unlink(file, () => { });
	}

	// Get gitmoji data from https://github.com/carloscuesta/gitmoji
	// https://github.com/carloscuesta/gitmoji/blob/master/src/data/gitmojis.json
	await download(
		'https://raw.githubusercontent.com/carloscuesta/gitmoji/master/src/data/gitmojis.json',
		'gitmojis.json',
	);

	/**
	 * @type {({ code: string; emoji: string })[]}
	 */
	// eslint-disable-next-line import/no-dynamic-require
	const gitmojis = require(path.join(process.cwd(), 'gitmojis.json')).gitmojis;
	for (const emoji of gitmojis) {
		if (emoji.code.startsWith(':') && emoji.code.endsWith(':')) {
			emoji.code = emoji.code.substring(1, emoji.code.length - 2);
		}

		if (shortcodeMap.has(emoji.code)) {
			// console.warn(`GitHub: ${emoji.code}`);
			continue;
		}
		shortcodeMap.set(emoji.code, emoji.emoji);
	}

	fs.unlink('gitmojis.json', () => { });

	// Sort the emojis for easier diff checking
	const list = [...shortcodeMap.entries()];
	list.sort();

	const map = list.reduce((m, [key, value]) => {
		m[key] = value;
		return m;
	}, Object.create(null));

	fs.writeFileSync(path.join(process.cwd(), 'resources/emojis.json'), JSON.stringify(map), 'utf8');
}

function download(url, destination) {
	return new Promise(resolve => {
		const stream = fs.createWriteStream(destination);
		https.get(url, rsp => {
			rsp.pipe(stream);
			stream.on('finish', () => {
				stream.close();
				resolve();
			});
		});
	});
}

void generate();
