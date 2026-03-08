// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { FalkorDBClient } from '../clients/falkordb';

export interface SymbolLookupInput {
	name: string;
	type?: 'function' | 'class' | 'type' | 'module';
}

export interface SymbolLookupResult {
	name: string;
	qualifiedName?: string;
	type: string;
	file: string;
	startLine: number;
	endLine: number;
	signature?: string;
	exported?: boolean;
}

export async function symbolLookup(
	db: FalkorDBClient,
	input: SymbolLookupInput
): Promise<SymbolLookupResult[]> {
	const labelFilter = input.type
		? `:${capitalize(input.type)}`
		: '';

	const cypher = input.type
		? `MATCH (s${labelFilter} {name: $name})
		   RETURN labels(s)[0] AS type, s.name AS name, s.qualifiedName AS qualifiedName,
		          s.file AS file, s.startLine AS startLine, s.endLine AS endLine,
		          s.signature AS signature, s.exported AS exported
		   LIMIT 50`
		: `MATCH (s)
		   WHERE s.name = $name AND (s:Function OR s:Class OR s:Type OR s:Module)
		   RETURN labels(s)[0] AS type, s.name AS name, s.qualifiedName AS qualifiedName,
		          s.file AS file, s.startLine AS startLine, s.endLine AS endLine,
		          s.signature AS signature, s.exported AS exported
		   LIMIT 50`;

	const result = await db.query(cypher, { name: input.name });

	return result.rows.map(row => {
		const record = flattenRow(row);
		return {
			name: String(record.name ?? input.name),
			qualifiedName: record.qualifiedName ? String(record.qualifiedName) : undefined,
			type: String(record.type ?? 'unknown'),
			file: String(record.file ?? ''),
			startLine: Number(record.startLine ?? 0),
			endLine: Number(record.endLine ?? 0),
			signature: record.signature ? String(record.signature) : undefined,
			exported: record.exported != null ? Boolean(record.exported) : undefined,
		};
	});
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
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
