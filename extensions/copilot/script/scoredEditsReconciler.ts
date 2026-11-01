/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { execSync } from 'child_process';
import * as fs from 'fs';
import minimist from 'minimist';
import * as path from 'path';

interface ScoredEditFile {
	edits: unknown[];
	[key: string]: unknown;
}

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
		const resolvedPath = path.resolve(filePath);
		if (!fs.existsSync(resolvedPath)) {
			console.error(`Error: File not found at path: ${filePath}`);
			process.exit(1);
		}
		try {
			const resolvedFileContents = await resolveMergeConflictFromFile(resolvedPath);
			await fs.promises.writeFile(resolvedPath, resolvedFileContents, 'utf8');
			console.log(`Successfully resolved conflicts for: ${filePath}`);
		} catch (e: unknown) {
			console.error(`Error resolving conflicts for ${filePath}:`, e instanceof Error ? e.message : e);
			process.exit(1);
		}
		return;
	}

	if (reconcileUsingGit) {
		try {
			const results = await Promise.allSettled(
				filesWithMergeConflicts.map(async (file) => {
					const resolvedFileContents = await resolveMergeConflictFromFile(file);
					await fs.promises.writeFile(file, resolvedFileContents, 'utf8');
					return file;
				})
			);

			let hasError = false;
			for (const result of results) {
				if (result.status === 'fulfilled') {
					console.log(`Successfully reconciled: ${result.value}`);
				} else {
					hasError = true;
					console.error(`Failed to reconcile file:`, result.reason);
				}
			}

			if (hasError) {
				process.exitCode = 1;
			}
			return;
		} catch (e: unknown) {
			console.error('Error during auto reconciliation:', e);
			process.exit(1);
		}
	}

	console.log(`
Usage: scoredEditReconciler [options]

Options:
  -a, --auto         Reconcile merge conflicts automatically by finding files with merge conflicts using git
  --file <path>      Path to the file to resolve merge conflicts
  --list             List files with merge conflicts
  --help             Show help
		`.trim());
}

async function scoredEditsWithMergeConflicts(): Promise<string[]> {
	const files = await findFilesWithMergeConflicts();
	return files.filter(file => file.endsWith('scoredEdits.w.json'));
}

async function findFilesWithMergeConflicts() {
	try {
		const gitOutput = execSync('git diff --name-only --diff-filter=U').toString();
		const conflictFiles = gitOutput.split('\n').filter(file => file.trim().length > 0);
		return conflictFiles.map(file => path.resolve(file));
	} catch (error) {
		console.error('Error finding files with merge conflicts:', error);
		return [];
	}
}

async function resolveMergeConflictFromFile(filePath: string) {
	const fileContents = await fs.promises.readFile(filePath, 'utf8');
	return resolveMergeConflict(fileContents, filePath);
}

export function resolveMergeConflict(fileContents: string, filePath = 'unknown'): string {
	const headFileContents = removeNonHeadSections(fileContents);
	const nonHeadFileContents = removeHeadSections(fileContents);

	let headFileAsObject: ScoredEditFile;
	let nonHeadfileAsObject: ScoredEditFile;

	try {
		headFileAsObject = JSON.parse(headFileContents);
	} catch (e) {
		throw new Error(`Failed to parse HEAD JSON in file ${filePath}: ${e instanceof Error ? e.message : e}`);
	}

	try {
		nonHeadfileAsObject = JSON.parse(nonHeadFileContents);
	} catch (e) {
		throw new Error(`Failed to parse non-HEAD JSON in file ${filePath}: ${e instanceof Error ? e.message : e}`);
	}

	if (JSON.stringify({ ...headFileAsObject, edits: [] }) !== JSON.stringify({ ...nonHeadfileAsObject, edits: [] })) {
		throw new Error(`Merge conflict detected outside \`edits\` field in ${filePath}, which cannot be resolved automatically.`);
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
