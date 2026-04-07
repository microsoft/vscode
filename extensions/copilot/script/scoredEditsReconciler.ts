/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { execSync } from 'child_process';
import * as fs from 'fs';
import minimist from 'minimist';
import * as path from 'path';

async function main() {
	const args = minimist(process.argv.slice(2));
	const filePath = args.file;
	const list = args.list;
	const reconcileUsingGit = args.a || args.auto;

	const filesWithMergeConflicts = await scoredEditsWithMergeConflicts();

	if (list) {
		console.log(filesWithMergeConflicts.join('\n'));
		return;
	}

	if (filePath) {
		try {
			const resolvedFileContents = await resolveMergeConflictFromFile(filePath);
			await fs.promises.writeFile(filePath, resolvedFileContents, 'utf8');
		} catch (e: unknown) {
			throw e;
		}
		return;
	}

	if (reconcileUsingGit) {
		try {
			await Promise.all(filesWithMergeConflicts.map(async (filePath) => {
				const resolvedFileContents = await resolveMergeConflictFromFile(filePath);
				return fs.promises.writeFile(filePath, resolvedFileContents);
			}));
			return;
		} catch (e: unknown) {
			throw e;
		}
	}


	console.log(`
Usage: scoredEditReconciler [options]

Options:
  -a, --auto       Reconcile merge conflicts automatically by finding files with merge conflicts using git
  --file <path>    Path to the file to resolve merge conflicts
  --list           List files with merge conflicts
  --help           Show help
		`.trim());
}

async function scoredEditsWithMergeConflicts(): Promise<string[]> /* paths */ {
	const files = await findFilesWithMergeConflicts();
	return files.filter(file => file.endsWith('scoredEdits.w.json'));
}

async function findFilesWithMergeConflicts() {
	try {
		// Get files with merge conflicts using git command
		const gitOutput = execSync('git diff --name-only --diff-filter=U').toString();

		// Split output into array of file paths
		const conflictFiles = gitOutput.split('\n').filter(file => file.trim().length > 0);

		return conflictFiles.map(file => path.resolve(file));
	} catch (error) {
		console.error('Error finding files with merge conflicts:', error);
		return [];
	}
}

async function resolveMergeConflictFromFile(filePath: string) {
	const fileContents = await fs.promises.readFile(filePath, 'utf8');
	return resolveMergeConflict(fileContents);
}

export function resolveMergeConflict(fileContents: string): string {

	const headFileContents = removeNonHeadSections(fileContents);
	const nonHeadFileContents = removeHeadSections(fileContents);

	const headFileAsObject = JSON.parse(headFileContents);
	const nonHeadfileAsObject = JSON.parse(nonHeadFileContents);
	if (JSON.stringify({ ...headFileAsObject, edits: [] }) !== JSON.stringify({ ...nonHeadfileAsObject, edits: [] })) {
		throw new Error('There seems to be merge conflict outside `edits` field which this script can resolve automatically.');
	}

	const mergedEdits = [...headFileAsObject.edits];

	for (const edit of nonHeadfileAsObject.edits) {
		if (!mergedEdits.some(headEdit => JSON.stringify(headEdit) === JSON.stringify(edit))) {
			mergedEdits.push(edit);
		}
	}

	const resolvedFileContents = JSON.stringify({
		...headFileAsObject,
		edits: mergedEdits
	}, null, '\t');

	return resolvedFileContents;
}

function removeNonHeadSections(fileContents: string) {
	const lines = fileContents.split('\n');
	const headLines = [];
	let insideNonHead = false;

	for (const line of lines) {
		if (line.startsWith('=======')) {
			insideNonHead = true;
		} else if (line.startsWith('>>>>>>>')) {
			insideNonHead = false;
		} else if (!insideNonHead && !line.startsWith('<<<<<<<')) {
			headLines.push(line);
		}
	}

	return headLines.join('\n');
}
function removeHeadSections(fileContents: string) {
	const lines = fileContents.split('\n');
	const nonHeadLines = [];
	let insideHead = false;

	for (const line of lines) {
		if (line.startsWith('<<<<<<<')) {
			insideHead = true;
		} else if (line.startsWith('=======')) {
			insideHead = false;
		} else if (!insideHead && !line.startsWith('>>>>>>>')) {
			nonHeadLines.push(line);
		}
	}

	return nonHeadLines.join('\n');
}

main();
