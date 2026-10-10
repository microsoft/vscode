/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import glob from 'glob';
import path from 'path';

export const apiProposalNamesSource = 'src/vscode-dts/**';

function getApiProposalName(filePath: string): string | undefined {
	return /vscode\.proposed\.(?<name>[a-zA-Z\d]+)\.d\.ts$/.exec(path.basename(filePath))?.groups?.name;
}

export function generateApiProposalNames(filePaths: Iterable<string>, eol: string): string {
	const proposals = new Map<string, { proposal: string }>();

	for (const filePath of filePaths) {
		const proposalName = getApiProposalName(filePath);
		if (proposalName === undefined) {
			continue;
		}

		proposals.set(proposalName, {
			proposal: `https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.${proposalName}.d.ts`,
		});
	}

	const names = [...proposals.keys()].sort();
	return [
		'/*---------------------------------------------------------------------------------------------',
		' *  Copyright (c) Microsoft Corporation. All rights reserved.',
		' *  Licensed under the MIT License. See License.txt in the project root for license information.',
		' *--------------------------------------------------------------------------------------------*/',
		'',
		'// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.',
		'',
		'const _allApiProposals = {',
		`${names.map(proposalName => {
			const proposal = proposals.get(proposalName)!;
			return `\t${proposalName}: {${eol}\t\tproposal: '${proposal.proposal}',${eol}\t}`;
		}).join(`,${eol}`)}`,
		'};',
		'export const allApiProposals = Object.freeze<{ [proposalName: string]: Readonly<{ proposal: string }> }>(_allApiProposals);',
		'export type ApiProposalName = keyof typeof _allApiProposals;',
		'',
	].join(eol);
}

export function checkApiProposalNames(repoRoot: string): void {
	const declarationsPath = path.join(repoRoot, 'src', 'vscode-dts');
	// Globs allow missing directories, but validation must not silently accept missing inputs.
	fs.readdirSync(declarationsPath);
	const proposalFiles = glob.sync(apiProposalNamesSource, { cwd: repoRoot, absolute: true })
		.filter(filePath => getApiProposalName(filePath) !== undefined)
		.sort();

	if (proposalFiles.length === 0) {
		throw new Error(`No API proposal declarations found in ${declarationsPath}.`);
	}

	for (const filePath of proposalFiles) {
		// Generation reads the declarations too; do not let unreadable inputs pass validation.
		fs.readFileSync(filePath);
	}

	const registryPath = path.join(repoRoot, 'src', 'vs', 'platform', 'extensions', 'common', 'extensionsApiProposals.ts');
	const updateMessage = 'Run "npm run gulp compile-api-proposal-names" from the repository root and include the updated registry with your change.';
	let existing: string;
	try {
		existing = fs.readFileSync(registryPath, 'utf8');
	} catch (error) {
		throw new Error(`Cannot read API proposal registry ${registryPath}. ${updateMessage}`, { cause: error });
	}

	if (existing.replace(/\r\n/g, '\n') !== generateApiProposalNames(proposalFiles, '\n')) {
		throw new Error(`API proposal registry ${registryPath} is out of date. ${updateMessage}`);
	}
}
