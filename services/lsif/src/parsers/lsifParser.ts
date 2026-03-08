// Son of Anton — LSIF/SCIP Parser
// Parses LSIF dump files and extracts cross-reference data for the graph.

import fs from 'fs';
import readline from 'readline';

// ============================================================================
// LSIF types (subset relevant to cross-reference extraction)
// ============================================================================

interface LsifVertex {
	id: string;
	type: 'vertex';
	label: string;
	[key: string]: unknown;
}

interface LsifEdge {
	id: string;
	type: 'edge';
	label: string;
	outV: string;
	inV?: string;
	inVs?: string[];
	[key: string]: unknown;
}

type LsifElement = LsifVertex | LsifEdge;

// ============================================================================
// Parsed cross-reference data
// ============================================================================

export interface SymbolDefinition {
	name: string;
	kind: 'function' | 'class' | 'interface' | 'variable' | 'type' | 'method' | 'property';
	file: string;
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
}

export interface SymbolReference {
	symbolName: string;
	definitionFile: string;
	referenceFile: string;
	referenceLine: number;
	referenceColumn: number;
	kind: 'read' | 'write' | 'call';
}

export interface TypeRelation {
	childName: string;
	parentName: string;
	relationType: 'extends' | 'implements';
}

export interface LsifParseResult {
	definitions: SymbolDefinition[];
	references: SymbolReference[];
	typeRelations: TypeRelation[];
}

// ============================================================================
// Parser
// ============================================================================

export class LsifParser {

	/**
	 * Parse an LSIF dump file (JSONL format) and extract cross-reference data.
	 */
	async parseLsif(filePath: string): Promise<LsifParseResult> {
		const result: LsifParseResult = {
			definitions: [],
			references: [],
			typeRelations: [],
		};

		// Build lookup tables from the LSIF graph
		const vertices = new Map<string, LsifVertex>();
		const rangeToDocument = new Map<string, string>();
		const resultSetToDefinition = new Map<string, string>();
		const definitionResults = new Map<string, string[]>();
		const referenceResults = new Map<string, string[]>();
		const documentUris = new Map<string, string>();
		const rangeData = new Map<string, { start: { line: number; character: number }; end: { line: number; character: number } }>();
		const hoverResults = new Map<string, string>();

		const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
		const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

		// First pass: collect all elements
		const elements: LsifElement[] = [];
		for await (const line of rl) {
			if (!line.trim()) {
				continue;
			}
			try {
				const element = JSON.parse(line) as LsifElement;
				elements.push(element);
			} catch {
				// Skip malformed lines
				continue;
			}
		}

		// Process vertices
		for (const elem of elements) {
			if (elem.type === 'vertex') {
				vertices.set(elem.id, elem);

				if (elem.label === 'document') {
					documentUris.set(elem.id, elem.uri as string);
				}

				if (elem.label === 'range') {
					const start = elem.start as { line: number; character: number };
					const end = elem.end as { line: number; character: number };
					if (start && end) {
						rangeData.set(elem.id, { start, end });
					}
				}

				if (elem.label === 'hoverResult') {
					const contents = elem.result as { contents?: Array<{ value?: string }> };
					if (contents?.contents?.[0]?.value) {
						hoverResults.set(elem.id, contents.contents[0].value);
					}
				}
			}
		}

		// Process edges
		for (const elem of elements) {
			if (elem.type !== 'edge') {
				continue;
			}

			const edge = elem as LsifEdge;

			switch (edge.label) {
				case 'contains':
					// Document contains ranges
					if (edge.inVs) {
						for (const rangeId of edge.inVs) {
							rangeToDocument.set(rangeId, edge.outV);
						}
					}
					break;

				case 'next':
					// Range -> ResultSet
					resultSetToDefinition.set(edge.outV, edge.inV ?? '');
					break;

				case 'textDocument/definition':
					// ResultSet -> DefinitionResult
					if (edge.inV) {
						definitionResults.set(edge.outV, [edge.inV]);
					}
					break;

				case 'textDocument/references':
					// ResultSet -> ReferenceResult
					if (edge.inV) {
						referenceResults.set(edge.outV, [edge.inV]);
					}
					break;

				case 'item':
					// DefinitionResult/ReferenceResult -> ranges
					if (edge.inVs) {
						const existing = definitionResults.get(edge.outV) ?? referenceResults.get(edge.outV);
						if (existing) {
							// Track document for these ranges
							const docId = (edge as unknown as { document: string }).document;
							for (const rangeId of edge.inVs) {
								if (docId) {
									rangeToDocument.set(rangeId, docId);
								}
							}
						}
					}
					break;
			}
		}

		// Build definitions and references
		for (const [rangeId, range] of rangeData) {
			const docId = rangeToDocument.get(rangeId);
			if (!docId) {
				continue;
			}

			const docUri = documentUris.get(docId);
			if (!docUri) {
				continue;
			}

			const filePath = this.uriToPath(docUri);

			// Check if this range is a definition
			const resultSetId = resultSetToDefinition.get(rangeId);
			if (resultSetId && definitionResults.has(resultSetId)) {
				// Get the symbol name from hover data
				const hover = hoverResults.get(resultSetId);
				const symbolName = hover ?? `symbol_${rangeId}`;

				result.definitions.push({
					name: symbolName,
					kind: 'function', // LSIF doesn't always specify kind clearly
					file: filePath,
					startLine: range.start.line + 1,
					startColumn: range.start.character,
					endLine: range.end.line + 1,
					endColumn: range.end.character,
				});
			}
		}

		console.log(
			`[lsif-parser] Parsed ${result.definitions.length} definitions, ` +
			`${result.references.length} references, ` +
			`${result.typeRelations.length} type relations`
		);

		return result;
	}

	/**
	 * Parse a SCIP index file.
	 * SCIP uses protobuf format; this requires the scip npm package.
	 * Falls back to a simplified text-based parsing for the JSON export.
	 */
	async parseScip(filePath: string): Promise<LsifParseResult> {
		const result: LsifParseResult = {
			definitions: [],
			references: [],
			typeRelations: [],
		};

		try {
			const content = await fs.promises.readFile(filePath, 'utf-8');
			const scipData = JSON.parse(content);

			if (scipData.documents) {
				for (const doc of scipData.documents) {
					const docPath = doc.relativePath ?? doc.path ?? '';

					if (doc.occurrences) {
						for (const occ of doc.occurrences) {
							const range = occ.range ?? [];
							const symbol = occ.symbol ?? '';
							const role = occ.symbolRoles ?? 0;

							// role & 1 = definition
							if (role & 1) {
								result.definitions.push({
									name: this.extractSymbolName(symbol),
									kind: 'function',
									file: docPath,
									startLine: (range[0] ?? 0) + 1,
									startColumn: range[1] ?? 0,
									endLine: (range[2] ?? range[0] ?? 0) + 1,
									endColumn: range[3] ?? 0,
								});
							} else {
								result.references.push({
									symbolName: this.extractSymbolName(symbol),
									definitionFile: '',
									referenceFile: docPath,
									referenceLine: (range[0] ?? 0) + 1,
									referenceColumn: range[1] ?? 0,
									kind: 'read',
								});
							}
						}
					}
				}
			}
		} catch (err) {
			console.error(`[lsif-parser] Error parsing SCIP file ${filePath}:`, err);
		}

		console.log(
			`[lsif-parser] SCIP parsed: ${result.definitions.length} definitions, ` +
			`${result.references.length} references`
		);

		return result;
	}

	private uriToPath(uri: string): string {
		if (uri.startsWith('file://')) {
			return decodeURIComponent(uri.substring('file://'.length));
		}
		return uri;
	}

	private extractSymbolName(scipSymbol: string): string {
		// SCIP symbols have a specific format:
		// e.g., "npm package_name 1.0.0 src/file.ts/ClassName#methodName()."
		const parts = scipSymbol.split('/');
		const last = parts[parts.length - 1] ?? scipSymbol;
		// Remove trailing symbols like #, (), .
		return last.replace(/[#().]+$/, '');
	}
}
