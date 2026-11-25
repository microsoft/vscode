/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getPnpmCommand } from '../../lib/pnpm.ts';

/**
 * Imports the translations of the Copilot extension from a checkout of
 * microsoft/vscode-extensions-loc (see l10n-steps.yml): the XLF files in
 * `out/<extension id>/<language>/` become the extension's
 * `package.nls.<language>.json` and `bundle.l10n.<language>.json` files. Runs
 * on every platform, unlike a shell script.
 *
 * Usage: node build/azure-pipelines/copilot/importTranslations.ts <vscode-extensions-loc folder>
 */

const extensionPath = path.join(import.meta.dirname, '..', '..', '..', 'extensions', 'copilot');

function main(locPath: string): void {
	const packageJson = JSON.parse(fs.readFileSync(path.join(extensionPath, 'package.json'), 'utf8')) as { publisher: string; name: string; l10n?: string };
	const extensionId = `${packageJson.publisher}.${packageJson.name}`;
	const translatedPath = path.join(locPath, 'out', extensionId);
	const xlfFiles = fs.existsSync(translatedPath)
		? fs.readdirSync(translatedPath, { withFileTypes: true })
			.filter(entry => entry.isDirectory())
			.flatMap(entry => fs.readdirSync(path.join(translatedPath, entry.name))
				.filter(file => file.endsWith('.xlf'))
				.map(file => path.join(translatedPath, entry.name, file)))
		: [];
	if (xlfFiles.length === 0) {
		console.log(`No translated strings found for ${extensionId}, skipping l10n import.`);
		return;
	}

	console.log(`Importing ${xlfFiles.length} translated XLF files...`);
	const l10nRoot = packageJson.l10n ?? '.';
	const pnpm = getPnpmCommand();
	execFileSync(pnpm.command, [...pnpm.args, 'exec', 'vscode-l10n-dev', 'import-xlf', '-o', l10nRoot, ...xlfFiles], { cwd: extensionPath, stdio: 'inherit', shell: pnpm.shell });

	// The import writes every file to the l10n root, but package.nls.*.json files belong at the extension root.
	const l10nPath = path.resolve(extensionPath, l10nRoot);
	if (l10nPath !== extensionPath) {
		for (const file of fs.readdirSync(l10nPath).filter(file => /^package\.nls\..+\.json$/.test(file))) {
			fs.renameSync(path.join(l10nPath, file), path.join(extensionPath, file));
		}
	}

	console.log('Localized files:');
	for (const file of [
		...fs.readdirSync(extensionPath).filter(file => /^package\.nls\..+\.json$/.test(file)),
		...fs.readdirSync(l10nPath).filter(file => /^bundle\.l10n\..+\.json$/.test(file)).map(file => path.join(l10nRoot, file)),
	]) {
		console.log(`  ${file}`);
	}
}

if (process.argv.length !== 3) {
	console.error('Usage: node build/azure-pipelines/copilot/importTranslations.ts <vscode-extensions-loc folder>');
	process.exit(1);
}

main(process.argv[2]);
