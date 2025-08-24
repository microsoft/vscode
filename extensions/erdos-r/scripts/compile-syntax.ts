/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync, writeFileSync, readdirSync } from 'fs';

function renderSyntax(inputFile: string) {

	const inputContents = readFileSync(inputFile, { encoding: 'utf-8' });
	const inputJson = JSON.parse(inputContents);

	let outputContents = inputContents;
	const vars = inputJson['variables'];
	for (const [key, value] of Object.entries(vars)) {
		const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
		outputContents = outputContents.replace(pattern, value as string);
	}

	const outputFile = inputFile.replace('src.json', 'gen.json');
	writeFileSync(outputFile, outputContents, { encoding: 'utf-8' });

	console.log(`[i] Generated '${inputFile}' => '${outputFile}'`);

}

const syntaxFiles = readdirSync('syntaxes', { encoding: 'utf-8' });
for (const syntaxFile of syntaxFiles) {
	if (syntaxFile.indexOf('src.json') !== -1) {
		renderSyntax(`syntaxes/${syntaxFile}`);
	}
}





