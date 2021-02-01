/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const tsMorph = require('ts-morph');

exports.getCommitDetails = function (commit) {
	let changes = [];

	const changesRaw = cp.execSync(`git diff-tree --no-commit-id --name-status -r ${commit}`, { encoding: 'utf8' });
	for (const change of changesRaw.split('\n')) {
		const changeDetails = change.split('\t');

		// Invalid output
		if (changeDetails.length !== 2) {
			continue;
		}

		// Deleted file
		if (changeDetails[0] === 'D') {
			continue;
		}

		changes.push(changeDetails[1]);
	}

	printDetails(`Commit changes (${commit})`, changesRaw);
	return changes;
};

exports.getLocalChangeDetails = function () {
	let changes = [];

	const changesRaw = cp.execSync(`git status -u -z`, { encoding: 'utf8' });
	for (const change of changesRaw.split('\0')) {
		const changeDetails = change.trim().split(/\s+/);
		// Invalid output
		if (changeDetails.length !== 2) {
			continue;
		}

		// Deleted file
		if (changeDetails[0].includes('D')) {
			continue;
		}

		if (changeDetails[1].endsWith('.ts')) {
			changes.push(changeDetails[1]);
		}
	}

	return changes;
}

exports.getReachableTestSuites = function (commnitChanges) {
	const testFiles = new Set();

	for (const file of commnitChanges) {
		// Added/Modified test file
		if (file.endsWith('.test.ts')) {
			testFiles.add(file);
			continue;
		}
		// Add reachable test suites
		getReachableTestSuitesFromFile(file).forEach(f => testFiles.add(f));
	}

	printDetails('Impacted test suites', [...testFiles]);
	printDetails('Executing test suites');
	return [...testFiles];
}

const dependencyMap = new Map();
function getDependencyMap(file) {
	if (dependencyMap.has(file)) {
		return dependencyMap.get(file);
	}

	const map = new Map();
	const tsConfigFilePath = getTsConfigFilePath(file);
	const project = new tsMorph.Project({ tsConfigFilePath });

	for (let file of project.getSourceFiles()) {
		const references = [];
		const filePath = file.getFilePath();
		const filePathKey = filePath.substr(filePath.indexOf('src/'));

		for (let node of file.getReferencingNodesInOtherSourceFiles()) {
			const referenceFilePath = node.getSourceFile().getFilePath();

			/// import('vs/platform/files/node/watcher/nsfw/nsfwWatcherService')
			if (node.getKind() === tsMorph.SyntaxKind.CallExpression) {
				references.push(referenceFilePath.substr(referenceFilePath.indexOf('src/')));
				continue;
			}

			// @ts-expect-error
			/// import { doBenchmark } from 'vs/editor/test/common/model/benchmark/benchmarkUtils';
			if (node.getKind() === tsMorph.SyntaxKind.ImportDeclaration && !node.isTypeOnly()) {
				references.push(referenceFilePath.substr(referenceFilePath.indexOf('src/')));
				continue;
			}
		}

		map.set(filePathKey, references);
	}

	dependencyMap.set(file, map);
	return dependencyMap.get(file);
}

function getReachableTestSuitesFromFile(file) {
	const array = [];
	const visited = new Set([...file]);
	const dependencyMap = getDependencyMap(file);

	const getIndentation = (indentation) => {
		let indentationStr = '';
		for (let i = 0; i < indentation; i++) {
			indentationStr = indentationStr + '    ';
		}
		return indentationStr;
	}

	printDetails(`Test impact analysis (${file})`);

	array.push({ indentation: 0, file });
	while (array.length !== 0) {
		//let item = array.shift(); // BFS
		let item = array.pop(); // DFS
		if (item.file.endsWith('.test.ts')) {
			console.log(getIndentation(item.indentation) + '* ' + item.file);
		} else {
			console.log(getIndentation(item.indentation) + '- ' + item.file);
		}
		const dependencies = dependencyMap.get(item.file);
		dependencies
			.filter(d => !visited.has(d))
			.forEach(d => {
				visited.add(d);
				array.push({ indentation: item.indentation + 1, file: d });
			});
	}

	return [...visited].filter(f => f.endsWith('.test.ts'));
}

function getTsConfigFilePath(file) {
	const folders = path.dirname(file).split(path.sep);
	while (folders.length !== 0) {
		const currentFolder = path.join(...folders);
		const tsconfigPath = `${currentFolder}${path.sep}tsconfig.json`;
		if (fs.existsSync(tsconfigPath)) {
			return tsconfigPath;
		}
		folders.pop();
	}

	return '';
}

function printDetails(string, message) {
	let divider = '';
	for (let i = 0; i < string.length + 4; i++) {
		divider += '*';
	}

	console.log('\n');
	console.log(divider);
	console.log(`* ${string} *`);
	console.log(divider);

	if (message) {
		console.log(message);
	}
}
