/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as scip from '@c4312/scip';
import * as LSIF from '@vscode/lsif-language-service';
import * as fs from 'fs/promises';
import type * as vscode from 'vscode';
import { ILanguageFeaturesService } from '../../../src/platform/languages/common/languageFeaturesService';
import { SimulationWorkspace } from '../../../src/platform/test/node/simulationWorkspace';
import { escapeRegExpCharacters } from '../../../src/util/vs/base/common/strings';
import { URI } from '../../../src/util/vs/base/common/uri';
import { Location, Range } from '../../../src/vscodeTypes';

const REPO_NAME = 'vscode-copilot';
const liftLSIFRange = (range: LSIF.types.Range): Range => new Range(range.start.line, range.start.character, range.end.line, range.end.character);
const liftLSIFLocations = (locations: undefined | LSIF.types.Location | LSIF.types.Location[]): vscode.Location[] => {
	if (!locations) {
		return [];
	}
	const arr = locations instanceof Array ? locations : [locations];
	return arr.map(l => new Location(URI.parse(l.uri), liftLSIFRange(l.range)));
};

type IGraph = Pick<LSIF.JsonStore, 'declarations' | 'definitions' | 'references'>;

/** Gets whether the SCIP occurence happens at the given posiiton */
const occursAt = (o: scip.Occurrence, position: LSIF.types.Position) => {
	const range = occurenceToPosition(o);
	if (position.line < range.start.line || (position.line === range.start.line && position.character < range.start.character)) {
		return false;
	}

	if (position.line > range.end.line || (position.line === range.end.line && position.character >= range.end.character)) {
		return false;
	}

	return true;
};

/** Converts an SCIP occurence to an LSIF range */
const occurenceToPosition = (o: scip.Occurrence): LSIF.types.Range => {
	const [startLine, startChar] = o.range;
	let endLine: number;
	let endChar: number;
	if (o.range.length >= 4) {
		[, , endLine, endChar] = o.range;
	} else {
		endLine = startLine;
		endChar = o.range[2];
	}

	return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
};

class SCIPGraph implements IGraph {
	private readonly workspaceUriLower: string;
	private readonly workspaceUriOriginal: URI;

	constructor(
		private readonly index: scip.Index,
		workspace: SimulationWorkspace,
	) {
		this.workspaceUriOriginal = workspace.workspaceFolders[0];
		this.workspaceUriLower = workspace.workspaceFolders[0].toString(true).toLowerCase();
	}

	declarations(uri: string, position: LSIF.types.Position): LSIF.types.Location | LSIF.types.Location[] | undefined {
		// https://github.com/sourcegraph/scip/blob/0504a347d36dbff48b21f53ccfedb46f3803855e/scip.proto#L501
		return this.findOccurencesOfSymbolAt(uri, position, o => !!(o.symbolRoles & 0x1));
	}

	definitions(uri: string, position: LSIF.types.Position): LSIF.types.Location | LSIF.types.Location[] | undefined {
		return this.declarations(uri, position); //  SCIP doesn't really differentiate I think...
	}

	references(uri: string, position: LSIF.types.Position, context: LSIF.types.ReferenceContext): LSIF.types.Location[] | undefined {
		return this.findOccurencesOfSymbolAt(uri, position, () => true);
	}

	private findOccurencesOfSymbolAt(uri: string, position: LSIF.types.Position, filter: (o: scip.Occurrence) => boolean): LSIF.types.Location[] {
		const toFind = this.getSymbolsAt(uri, position);
		const locations: LSIF.types.Location[] = [];
		for (const doc of this.index.documents) {
			for (const occurence of doc.occurrences) {
				if (occurence.symbolRoles & 0x1 && toFind.has(occurence.symbol)) {// definition
					toFind.delete(occurence.symbol);
					locations.push({
						uri: URI.joinPath(this.workspaceUriOriginal, doc.relativePath.replaceAll('\\', '/')).toString(true),
						range: occurenceToPosition(occurence),
					});
				}
			}
		}

		return locations;
	}

	private getSymbolsAt(uri: string, position: LSIF.types.Position): Set<string> {
		const doc = this.getDoc(uri);
		if (!doc) { return new Set(); }

		const toFind = new Set<string>();
		for (const occurence of doc.occurrences) {
			if (occursAt(occurence, position)) {
				toFind.add(occurence.symbol);
			}
		}

		return toFind;
	}

	private getDoc(uriInWorkspace: string) {
		uriInWorkspace = uriInWorkspace.toLowerCase().replaceAll('\\', '/');
		if (!uriInWorkspace.startsWith(this.workspaceUriLower)) {
			return undefined;
		}

		uriInWorkspace = uriInWorkspace.slice(this.workspaceUriLower.length);
		if (uriInWorkspace.startsWith('/')) {
			uriInWorkspace = uriInWorkspace.slice(1);
		}

		return this.index.documents.find(d => d.relativePath.replaceAll('\\', '/').toLowerCase() === uriInWorkspace);
	}
}

const makeTranslator = (workspace: SimulationWorkspace, indexRoot: string) => {
	let simulationRootUri = workspace.workspaceFolders[0].toString(true);
	if (simulationRootUri.endsWith('/')) {
		simulationRootUri = simulationRootUri.slice(0, -1);
	}

	const indexPath = URI.parse(indexRoot).path;
	const lastIndex = indexPath.lastIndexOf(REPO_NAME);
	if (lastIndex === -1) {
		throw new Error(`Index path ${indexPath} does not contain 'vscode-copilot', please ensure the index is generated in the correct workspace`);
	}

	const subdir = indexPath.slice(lastIndex + REPO_NAME.length + 1);
	const localRootRe = new RegExp(`^file:\\/\\/.*?${escapeRegExpCharacters(subdir.replaceAll('\\', '/'))}`, 'i');

	return {
		fromDatabase: (uri: string) => uri.replace(localRootRe, simulationRootUri),
		toDatabase: (uri: string) => uri.startsWith(simulationRootUri) ? uri.replace(simulationRootUri, indexRoot) : uri,
	};
};

/**
 * A language features service powered by an LSIF index. To use this, you need
 * to have generated an LSIF index for your workspace. This can be done in
 * several ways:
 *
 * - Rust: ensure rust-analyzer is installed (rustup component add rust-analyzer)
 *   and run `rust-analyzer lsif ./ > lsif.json` in the workspace root.
 *
 * If you index a new language, please add instructions above.
 */
export class LSIFLanguageFeaturesService implements ILanguageFeaturesService {
	_serviceBrand: undefined;

	private _graph: Promise<IGraph> | undefined;

	/**
	 * @param workspace The simulation workspace
	 * @param indexFilePath Path to an LSIF index file
	 */
	constructor(
		private readonly workspace: SimulationWorkspace,
		private readonly indexFilePath: string,
	) { }

	private _getGraph(): Promise<IGraph> {
		if (!this._graph) {
			this._graph = this._load();
		}
		return this._graph;
	}

	private async _load(): Promise<IGraph> {
		if (this.indexFilePath.endsWith('.scip')) {
			const contents = await fs.readFile(this.indexFilePath);
			const index = scip.deserializeSCIP(contents);
			return new SCIPGraph(index, this.workspace);
		}

		const graph = new LSIF.JsonStore();
		try {
			await graph.load(this.indexFilePath, r => makeTranslator(this.workspace, r));
		} catch (e) {
			throw new Error(`Failed to parse LSIF index from ${this.indexFilePath}: ${e}`);
		}
		return graph;
	}

	async getDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
		throw new Error('Unimplemented: excercise for the reader');
	}

	async getDefinitions(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.LocationLink | vscode.Location)[]> {
		const graph = await this._getGraph();
		return liftLSIFLocations(graph.definitions(uri.toString(true), position));
	}

	async getImplementations(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.LocationLink | vscode.Location)[]> {
		const graph = await this._getGraph();
		return liftLSIFLocations(graph.declarations(uri.toString(true), position));
	}

	async getReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
		const graph = await this._getGraph();
		return liftLSIFLocations(graph.references(uri.toString(true), position, { includeDeclaration: true }));
	}

	getDiagnostics(_uri: vscode.Uri): vscode.Diagnostic[] {
		return []; // not part of LSIF
	}

	async getWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		throw new Error('Unimplemented: excercise for the reader');
		// would have to iterate through all documents, get all symbols that match
	}
}
