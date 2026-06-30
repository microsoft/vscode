/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import type * as vscode from 'vscode';
import { VsCodeTextDocument } from '../../../../platform/editing/common/abstractText';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { getStructureUsingIndentation } from '../../../../platform/parser/node/indentationStructure';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { WASMLanguage } from '../../../../platform/parser/node/treeSitterLanguages';
import { IPlaygroundRunnerGlobals } from '../../../../util/common/debugValueEditorGlobals';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import * as path from '../../../../util/vs/base/common/path';
import { URI } from '../../../../util/vs/base/common/uri';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { Range, Selection } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { getAdjustedSelection } from '../inline/adjustSelection';
import { IProjectedDocumentDebugInfo } from '../inline/summarizedDocument/implementation';
import { IDocumentSummarizationItem, ISummarizedDocumentSettings, summarizeDocumentsSync } from '../inline/summarizedDocument/summarizeDocument';
import { summarizeDocumentSync } from '../inline/summarizedDocument/summarizeDocumentHelpers';
import { SummarizeDocumentPlayground } from './summarizeDocumentPlayground';

export const DEFAULT_CHAR_LIMIT = 9557.333333333334;

export function loadFile(data: FixtureData): Promise<ITestFile>;
export function loadFile(data: Omit<FixtureData, 'filePath'> & { fileName: string; fileContents: string }): Promise<'not_supported'>;
export async function loadFile(data: FixtureData | (Omit<FixtureData, 'filePath'> & { fileName: string; fileContents: string })): Promise<ITestFile | 'not_supported'> {
	if ('fileName' in data) { return 'not_supported'; }
	const contents = (await fs.promises.readFile(data.filePath)).toString();
	return {
		contents,
		filePath: data.filePath,
		languageId: data.languageId,
		formattingOptions: undefined,
	};
}

interface FixtureData {
	filePath: string;
	languageId: 'typescript' | string;
}

/** See https://github.com/microsoft/vscode-ts-file-path-support */
export type RelativeFilePath<T extends string> = string & { baseDir?: T };

export function fixture(relativePath: RelativeFilePath<'$dir/fixtures'>): string {
	const filePath = path.join(__dirname, 'fixtures', relativePath);
	return filePath;
}
export function getSummarizedSnapshotPath(data: ITestFile, version?: string): string {
	const secondaryExtension = (version ? `${version}.` : '') + 'summarized';
	return addSecondaryExtension(data.filePath, secondaryExtension);
}

function addSecondaryExtension(filePath: string, extension: string): string {
	const parts = filePath.split('.');
	parts.splice(parts.length - 1, 0, extension);
	return parts.join('.');
}


export async function fromFixtureOld(
	pathWithinFixturesDir: string,
	languageId: WASMLanguage | string,
	formattingOptions?: vscode.FormattingOptions
): Promise<ITestFile> {
	const filePath = path.join(__dirname, 'fixtures', pathWithinFixturesDir);
	const contents = (await fs.promises.readFile(filePath)).toString();
	return { filePath: filePath, contents, languageId, formattingOptions };
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

export function summarizedDocPathInFixture(pathWithinFixturesDir: string) {
	return docPathInFixture(pathWithinFixturesDir, 'summarized');
}

export function selectionDocPathInFixture(pathWithinFixturesDir: string) {
	return docPathInFixture(pathWithinFixturesDir, 'selection');
}

interface ITestFile {
	contents: string;
	filePath: string;
	languageId: WASMLanguage | string;
	formattingOptions?: vscode.FormattingOptions;
}
export async function generateSummarizedDocument(
	filePromise: ITestFile | Promise<ITestFile>,
	selection: [lineNumber: number, columnNumber: number] | [number, number, number, number] | undefined,
	charLimit: number = DEFAULT_CHAR_LIMIT,
	settings: ISummarizedDocumentSettings = {},
): Promise<{ text: string; adjustedSelection: OffsetRange }> {
	const file = await filePromise;
	const doc = TextDocumentSnapshot.create(createTextDocumentData(
		URI.from({ scheme: 'test', path: '/path/file.txt' }),
		file.contents,
		file.languageId
	).document);
	const accessor = createExtensionUnitTestingServices().createTestingAccessor();
	const parserService = accessor.get(IParserService);
	const currentDocAST = parserService.getTreeSitterAST(doc);
	let structure = currentDocAST
		? await currentDocAST.getStructure()
		: undefined;
	if (!structure) {
		structure = getStructureUsingIndentation(
			new VsCodeTextDocument(doc),
			doc.languageId,
			file.formattingOptions
		);
	}
	const selections = selection ? getAdjustedSelection(structure, new VsCodeTextDocument(doc), toSelection(selection)) : undefined;
	const summarizedDoc = summarizeDocumentSync(
		charLimit,
		doc,
		selection ? toSelection(selection) : undefined,
		structure,
		settings,
	) as IProjectedDocumentDebugInfo;

	const playgroundRunnerData = (globalThis as any as IPlaygroundRunnerGlobals).$$playgroundRunner_data;
	if (playgroundRunnerData) {
		function getDoc(text: string) {
			const file = { contents: text, languageId: doc.languageId };
			const data = createTextDocumentData(
				URI.from({ scheme: 'test', path: '/path/file.ts' }),
				file.contents,
				file.languageId,
			);
			return data;
		}

		globalThis.playground = new SummarizeDocumentPlayground(
			summarizedDoc,
			selection ? toSelection(selection) : new Range(0, 0, 0, 0),
			charLimit,
			(text) => parserService.getTreeSitterAST(getDoc(text).document)!.getStructure(),
			(text, charLimit, selection, structure) => summarizeDocumentSync(
				charLimit,
				TextDocumentSnapshot.create(getDoc(text).document),
				selection,
				structure,
				settings,
			) as IProjectedDocumentDebugInfo
		);

		globalThis.summarizedDoc = summarizedDoc;
		const g = globalThis as any;
		g.$$debugValueEditor_properties = [
			{
				label: `Active Test: "${playgroundRunnerData.currentPath.join(' > ')}"`,
			},
			{
				label: 'Summarized Document',
				expression: getExprText(() => globalThis.playground!.getSummarizedText()),
			},
			{
				label: `Document Syntax Tree`,
				expression: getExprText(() => globalThis.playground!.getAst()),
			},
			{
				label: 'Input Document + Selection',
				expression: getExprText(() => globalThis.playground!.inputDocument),
			},
			{
				label: 'Input Options',
				expression: getExprText(() => globalThis.playground!.inputOptions),
			},
		];
		g.$$debugValueEditor_refresh?.('{}');
	}

	return {
		text: summarizedDoc.text,
		adjustedSelection: selections ? summarizedDoc.projectOffsetRange(selections.adjusted) : new OffsetRange(0, 0),
	};
}
export async function generateSummarizedDocuments(
	input: {
		filePromise: ITestFile | Promise<ITestFile>;
		selection: [number, number] | [number, number, number, number] | undefined;
	}[],
	charLimit: number = DEFAULT_CHAR_LIMIT,
	settings: ISummarizedDocumentSettings = {},
) {

	const items: IDocumentSummarizationItem[] = [];

	for (const { filePromise, selection } of input) {


		const file = await filePromise;
		const doc = TextDocumentSnapshot.create(createTextDocumentData(
			URI.from({ scheme: 'test', path: file.filePath }),
			file.contents,
			file.languageId
		).document);
		const accessor = createExtensionUnitTestingServices().createTestingAccessor();
		const parserService = accessor.get(IParserService);
		const currentDocAST = parserService.getTreeSitterAST(doc);
		let structure = currentDocAST
			? await currentDocAST.getStructure()
			: undefined;
		if (!structure) {
			structure = getStructureUsingIndentation(
				new VsCodeTextDocument(doc),
				doc.languageId,
				file.formattingOptions
			);
		}
		// const selections = selection ? getAdjustedSelection(structure, doc, toSelection(selection)) : undefined;

		items.push({
			document: doc,
			overlayNodeRoot: structure,
			selection: selection && toSelection(selection)
		});

	}

	return summarizeDocumentsSync(
		charLimit,
		settings,
		items
	);
}

export function getExprText(arrowFn: () => any): string {
	const src = arrowFn.toString();
	const parts = src.split('=>');
	const expr = parts[1];
	return expr.trim();
}

declare namespace globalThis {
	export let playground: SummarizeDocumentPlayground | undefined;
	export let summarizedDoc: IProjectedDocumentDebugInfo | undefined;
}
export async function generateSummarizedDocumentAndExtractGoodSelection(
	filePromise: ITestFile | Promise<ITestFile>,
	selection: [number, number] | [number, number, number, number],
	charLimit: number = DEFAULT_CHAR_LIMIT
): Promise<[string | undefined, string | undefined]> {
	const result = await generateSummarizedDocument(filePromise, selection, charLimit);
	if (!result) {
		return [undefined, undefined];
	}
	const adjustedSelection = result.adjustedSelection;
	const codeAbove = result.text.substring(
		0,
		adjustedSelection.start
	);
	const adjustedSelectedCode = result.text.substring(
		adjustedSelection.start,
		adjustedSelection.endExclusive
	);
	const codeBelow = result.text.substring(
		adjustedSelection.endExclusive
	);

	return [`${codeAbove}__SELECTION_HERE__${codeBelow}`, adjustedSelectedCode];
}
function toSelection(
	selection: [number, number] | [number, number, number, number]
): vscode.Selection {
	if (selection.length === 2) {
		return new Selection(
			selection[0],
			selection[1],
			selection[0],
			selection[1]
		);
	} else {
		return new Selection(
			selection[0],
			selection[1],
			selection[2],
			selection[3]
		);
	}
}
