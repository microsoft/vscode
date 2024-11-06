/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import 'mocha';
import { basename, join, normalize } from 'path';
import * as vscode from 'vscode';

const TREE_SITTER_COMMAND = '_workbench.colorizeTreeSitterTokens';
const TEXT_MATE_COMMAND = '_workbench.colorizeTextMateTokens';

interface BestsAndWorsts {
	bestParse?: number;
	bestCapture?: number;
	bestMetadata?: number;
	bestCombined: number;
	worstParse?: number;
	worstCapture?: number;
	worstMetadata?: number;
	worstCombined: number;
}

function findBestsAndWorsts(results: { parseTime?: number; captureTime?: number; metadataTime?: number; tokenizeTime?: number }[]): BestsAndWorsts {
	let bestParse: number | undefined;
	let bestCapture: number | undefined;
	let bestMetadata: number | undefined;
	let bestCombined: number | undefined;
	let worstParse: number | undefined;
	let worstCapture: number | undefined;
	let worstMetadata: number | undefined;
	let worstCombined: number | undefined;

	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		if (result.parseTime && result.captureTime && result.metadataTime) {
			// Tree Sitter
			const combined = result.parseTime + result.captureTime + result.metadataTime;
			if (bestParse === undefined || result.parseTime < bestParse) {
				bestParse = result.parseTime;
			}
			if (bestCapture === undefined || result.captureTime < bestCapture) {
				bestCapture = result.captureTime;
			}
			if (bestMetadata === undefined || result.metadataTime < bestMetadata) {
				bestMetadata = result.metadataTime;
			}
			if (bestCombined === undefined || combined < bestCombined) {
				bestCombined = combined;
			}
			if (i !== 0) {
				if (worstParse === undefined || result.parseTime > worstParse) {
					worstParse = result.parseTime;
				}
				if (worstCapture === undefined || result.captureTime > worstCapture) {
					worstCapture = result.captureTime;
				}
				if (worstMetadata === undefined || result.metadataTime > worstMetadata) {
					worstMetadata = result.metadataTime;
				}
				if (worstCombined === undefined || combined > worstCombined) {
					worstCombined = combined;
				}
			}
		} else if (result.tokenizeTime) {
			// TextMate
			if (bestCombined === undefined || result.tokenizeTime < bestCombined) {
				bestCombined = result.tokenizeTime;
			}
			if (i !== 0 && (worstCombined === undefined || result.tokenizeTime > worstCombined)) {
				worstCombined = result.tokenizeTime;
			}
		}
	}
	return {
		bestParse,
		bestCapture,
		bestMetadata,
		bestCombined: bestCombined!,
		worstParse,
		worstCapture,
		worstMetadata,
		worstCombined: worstCombined!,
	};
}

interface TreeSitterTimes {
	parseTime: number;
	captureTime: number;
	metadataTime: number;
}

interface TextMateTimes {
	tokenizeTime: number;
}

async function runCommand<TimesType = TreeSitterTimes | TextMateTimes>(command: string, file: vscode.Uri, times: number): Promise<TimesType[]> {
	const results: TimesType[] = [];
	for (let i = 0; i < times; i++) {
		results.push(await vscode.commands.executeCommand(command, file));
	}
	return results;
}

async function doFullFile(file: vscode.Uri, times: number) {
	const treeSitterResults = await runCommand<TreeSitterTimes>(TREE_SITTER_COMMAND, file, times);

	const { bestParse, bestCapture, bestMetadata, bestCombined, worstParse, worstCapture, worstMetadata, worstCombined } = findBestsAndWorsts(treeSitterResults);
	const textMateResults = await runCommand<TextMateTimes>(TEXT_MATE_COMMAND, file, times);
	const textMateBestWorst = findBestsAndWorsts(textMateResults);

	const toString = (time: number, charLength: number) => {
		// truncate time to charLength characters
		return time.toString().slice(0, charLength).padEnd(charLength, ' ');
	};
	const numLength = 7;
	const resultString = `                        | First   | Best    | Worst   |
| --------------------- | ------- | ------- | ------- |
| TreeSitter (parse)    | ${toString(treeSitterResults[0].parseTime, numLength)} | ${toString(bestParse!, numLength)} | ${toString(worstParse!, numLength)} |
| TreeSitter (capture)  | ${toString(treeSitterResults[0].captureTime, numLength)} | ${toString(bestCapture!, numLength)} | ${toString(worstCapture!, numLength)} |
| TreeSitter (metadata) | ${toString(treeSitterResults[0].metadataTime, numLength)} | ${toString(bestMetadata!, numLength)} | ${toString(worstMetadata!, numLength)} |
| TreeSitter (total)    | ${toString(treeSitterResults[0].parseTime + treeSitterResults[0].captureTime + treeSitterResults[0].metadataTime, numLength)} | ${toString(bestCombined, numLength)} | ${toString(worstCombined, numLength)} |
| TextMate              | ${toString(textMateResults[0].tokenizeTime, numLength)} | ${toString(textMateBestWorst.bestCombined, numLength)} | ${toString(textMateBestWorst.worstCombined, numLength)} |
`;
	console.log(`File ${basename(file.fsPath)}:`);
	console.log(resultString);
}

async function doDestructiveEditTest(file: vscode.Uri, _times: number) {
	const editor = await vscode.window.showTextDocument(file);
	// Ensure that the first parse is done by running the tree sitter command
	await vscode.commands.executeCommand<TreeSitterTimes>(TREE_SITTER_COMMAND);
	// make a destructive edit
	const editResult = await editor.edit((builder) => {
		builder.insert(new vscode.Position(2, 0), '/**');
	});
	if (!editResult) {
		throw new Error('Unable to make edit!');
	}

	const result = await vscode.commands.executeCommand<TreeSitterTimes>(TREE_SITTER_COMMAND);

}

suite('Tokenization Performance', () => {
	const testPath = normalize(join(__dirname, '../test'));
	const fixturesPath = join(testPath, 'colorize-fixtures');
	let originalSettingValue: any;

	suiteSetup(async function () {
		originalSettingValue = vscode.workspace.getConfiguration('editor').get('experimental.preferTreeSitter');
		await vscode.workspace.getConfiguration('editor').update('experimental.preferTreeSitter', ["typescript"], vscode.ConfigurationTarget.Global);
	});
	suiteTeardown(async function () {
		await vscode.workspace.getConfiguration('editor').update('experimental.preferTreeSitter', originalSettingValue, vscode.ConfigurationTarget.Global);
	});

	for (const fixture of fs.readdirSync(fixturesPath)) {
		test(`Full file colorize: ${fixture}`, async function () {
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			await doFullFile(vscode.Uri.file(join(fixturesPath, fixture)), 6);
		});
	}

	for (const fixture of fs.readdirSync(fixturesPath)) {
		test(`Destructive edit colorize: ${fixture}`, async function () {
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			await doDestructiveEditTest(vscode.Uri.file(join(fixturesPath, fixture)), 6);
		});
	}
});
