// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { FalkorDBClient } from '../clients/falkordb';

export interface FindReferencesInput {
	name: string;
	file?: string;
}

export interface ReferenceLocation {
	file: string;
	line: number;
	column: number;
	kind: string;
	context?: string;
}

export async function findReferences(
	db: FalkorDBClient,
	input: FindReferencesInput
): Promise<ReferenceLocation[]> {
	const fileFilter = input.file ? ' AND s.file = $file' : '';

	const cypher = `
		MATCH (ref)-[r:REFERENCES]->(s)
		WHERE s.name = $name${fileFilter}
		RETURN ref.file AS file, r.line AS line, r.column AS column,
		       r.kind AS kind, ref.name AS context
		ORDER BY ref.file, r.line
		LIMIT 200
	`;

	const params: Record<string, unknown> = { name: input.name };
	if (input.file) {
		params.file = input.file;
	}

	const result = await db.query(cypher, params);

	return result.rows.map(row => {
		const record = flattenRow(row);
		return {
			file: String(record.file ?? ''),
			line: Number(record.line ?? 0),
			column: Number(record.column ?? 0),
			kind: String(record.kind ?? 'read'),
			context: record.context ? String(record.context) : undefined,
		};
	});
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
