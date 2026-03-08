// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { FalkorDBClient } from '../clients/falkordb';

export interface FileSummaryInput {
	path: string;
}

export interface FileSummaryResult {
	path: string;
	language: string;
	lineCount: number;
	exports: SymbolSummary[];
	classes: SymbolSummary[];
	functions: SymbolSummary[];
	types: SymbolSummary[];
	imports: ImportSummary[];
	dependencies: string[];
	warning?: string;
}

interface SymbolSummary {
	name: string;
	startLine: number;
	endLine: number;
	exported: boolean;
	signature?: string;
}

interface ImportSummary {
	source: string;
	specifiers: string;
}

export async function fileSummary(
	db: FalkorDBClient,
	input: FileSummaryInput
): Promise<FileSummaryResult> {
	const [fileResult, symbolsResult, importsResult, depsResult] = await Promise.all([
		db.query(
			`MATCH (f:File {path: $path})
			 RETURN f.language AS language, f.lineCount AS lineCount`,
			{ path: input.path }
		),
		db.query(
			`MATCH (f:File {path: $path})-[:CONTAINS]->(s)
			 RETURN labels(s)[0] AS type, s.name AS name,
			        s.startLine AS startLine, s.endLine AS endLine,
			        s.exported AS exported, s.signature AS signature
			 ORDER BY s.startLine`,
			{ path: input.path }
		),
		db.query(
			`MATCH (i:Import {file: $path})
			 RETURN i.source AS source, i.specifiers AS specifiers
			 ORDER BY i.line`,
			{ path: input.path }
		),
		db.query(
			`MATCH (f:File {path: $path})-[:IMPORTS]->(dep:File)
			 RETURN dep.path AS depPath
			 ORDER BY dep.path`,
			{ path: input.path }
		),
	]);

	const fileInfo = fileResult.rows.length > 0 ? flattenRow(fileResult.rows[0]) : {};
	const symbols = symbolsResult.rows.map(row => flattenRow(row));

	const classes: SymbolSummary[] = [];
	const functions: SymbolSummary[] = [];
	const types: SymbolSummary[] = [];
	const exports: SymbolSummary[] = [];

	for (const sym of symbols) {
		const summary: SymbolSummary = {
			name: String(sym.name ?? ''),
			startLine: Number(sym.startLine ?? 0),
			endLine: Number(sym.endLine ?? 0),
			exported: Boolean(sym.exported),
			signature: sym.signature ? String(sym.signature) : undefined,
		};

		const symType = String(sym.type ?? '');
		if (symType === 'Class') {
			classes.push(summary);
		} else if (symType === 'Function') {
			functions.push(summary);
		} else if (symType === 'Type') {
			types.push(summary);
		}

		if (summary.exported) {
			exports.push(summary);
		}
	}

	const imports = importsResult.rows.map(row => {
		const record = flattenRow(row);
		return {
			source: String(record.source ?? ''),
			specifiers: String(record.specifiers ?? ''),
		};
	});

	const dependencies = depsResult.rows.map(row => {
		const record = flattenRow(row);
		return String(record.depPath ?? '');
	});

	const hasData = symbols.length > 0 || imports.length > 0;

	return {
		path: input.path,
		language: String(fileInfo.language ?? 'unknown'),
		lineCount: Number(fileInfo.lineCount ?? 0),
		exports,
		classes,
		functions,
		types,
		imports,
		dependencies,
		...(!hasData ? { warning: 'No data found for this file. It may not have been indexed yet.' } : {}),
	};
}

function flattenRow(row: Record<string, unknown>[]): Record<string, unknown> {
	const flat: Record<string, unknown> = {};
	for (const cell of row) {
		if (typeof cell === 'object' && cell !== null) {
			Object.assign(flat, cell);
		}
	}
	return flat;
}
