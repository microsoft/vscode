/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from '../../../../util/vs/base/common/path';
import type * as vscode from 'vscode';
import { BaseAlternativeNotebookContentProvider } from '../../../../platform/notebook/common/alternativeContentProvider';
import { SimulationWorkspace } from '../../../../platform/test/node/simulationWorkspace';
import { ExtHostNotebookDocumentData } from '../../../../util/common/test/shims/notebookDocument';
import { Uri } from '../../../../vscodeTypes';

export function loadFile(data: FixtureData): Promise<ITestFile>;
export function loadFile(data: Omit<FixtureData, 'filePath'> & { fileName: string; fileContents: string }): Promise<'not_supported'>;
export async function loadFile(data: FixtureData | (Omit<FixtureData, 'filePath'> & { fileName: string; fileContents: string })): Promise<ITestFile | 'not_supported'> {
	if ('fileName' in data) { return 'not_supported'; }
	const contents = (await fs.promises.readFile(data.filePath)).toString();
	return {
		contents,
		filePath: data.filePath,
		formattingOptions: undefined,
	};
}

interface FixtureData {
	filePath: string;
}

export type RelativeFilePath<T extends string> = string & { baseDir?: T };

export function fixture(relativePath: RelativeFilePath<'$dir/fixtures'>): string {
	const filePath = path.join(__dirname, 'fixtures', relativePath);
	return filePath;
}
export function getAlternativeNotebookSnapshotPath(data: ITestFile, extension: string): string {
	return addSecondaryExtension(data.filePath, [extension]);
}

function addSecondaryExtension(filePath: string, extensions: string[]): string {
	return filePath + '.' + extensions.join('.');
}


export function docPathInFixture(pathWithinFixturesDir: string, type: 'summarized' | 'selection') {
	const dirname = path.dirname(pathWithinFixturesDir);
	const basename = path.basename(pathWithinFixturesDir);
	const basenameByDots = basename.split('.');
	basenameByDots.splice(basenameByDots.length - 1, 0, type);
	const docBasename = basenameByDots.join('.');
	const docPathWithinFixturesDir = path.join(dirname, docBasename);
	return path.join(__dirname, 'fixtures', docPathWithinFixturesDir);
}

interface ITestFile {
	contents: string;
	filePath: string;
	formattingOptions?: vscode.FormattingOptions;
}
export async function generateAlternativeContent(
	filePromise: ITestFile | Promise<ITestFile>,
	contentProvider: BaseAlternativeNotebookContentProvider,
): Promise<{ content: string; notebook: vscode.NotebookDocument }> {
	const notebook = await loadNotebook(filePromise);

	const content = contentProvider.getAlternativeDocument(notebook).getText();
	return { content, notebook };
}

export async function loadNotebook(filePromise: ITestFile | Promise<ITestFile>, simulationWorkspace?: SimulationWorkspace) {
	const file = await filePromise;
	const uri = Uri.file(file.filePath);
	return file.filePath.endsWith('.ipynb') ? ExtHostNotebookDocumentData.createJupyterNotebook(uri, file.contents, simulationWorkspace).document :
		ExtHostNotebookDocumentData.createGithubIssuesNotebook(uri, file.contents, simulationWorkspace).document;
}