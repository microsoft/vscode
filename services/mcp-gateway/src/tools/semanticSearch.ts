// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { FalkorDBClient } from '../clients/falkordb';
import { QdrantClient, SemanticSearchResult } from '../clients/qdrant';

export interface SemanticSearchInput {
	query: string;
	maxResults?: number;
	language?: string;
}

export interface RankedSearchResult extends SemanticSearchResult {
	relevanceScore: number;
	structuralImportance: number;
}

export async function semanticSearch(
	qdrant: QdrantClient,
	db: FalkorDBClient,
	input: SemanticSearchInput,
	embedQuery: (text: string) => Promise<number[]>
): Promise<RankedSearchResult[]> {
	const maxResults = Math.min(input.maxResults ?? 10, 50);

	const queryVector = await embedQuery(input.query);

	const filter = input.language
		? {
			must: [{ key: 'language', match: { value: input.language } }],
		}
		: undefined;

	const results = await qdrant.search(queryVector, maxResults * 2, filter);

	// Fetch structural importance scores from FalkorDB
	const rankedResults = await addStructuralScores(db, results);

	// Sort by combined score (semantic similarity + structural importance)
	rankedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

	return rankedResults.slice(0, maxResults);
}

async function addStructuralScores(
	db: FalkorDBClient,
	results: SemanticSearchResult[]
): Promise<RankedSearchResult[]> {
	const ranked: RankedSearchResult[] = [];

	// Build a list of unique (symbolName, filePath) pairs to look up in a single query.
	type SymbolKeyEntry = {
		key: string;
		name: string;
		file: string;
	};

	const symbolEntries: SymbolKeyEntry[] = [];
	const seenKeys = new Set<string>();

	for (const result of results) {
		if (!result.symbolName || !result.filePath) {
			continue;
		}
		const key = `${result.symbolName}::${result.filePath}`;
		if (seenKeys.has(key)) {
			continue;
		}
		seenKeys.add(key);
		symbolEntries.push({
			key,
			name: result.symbolName,
			file: result.filePath,
		});
	}

	// Map from symbol key to in-degree.
	const inDegreeByKey = new Map<string, number>();

	if (symbolEntries.length > 0) {
		try {
			// Batch in-degree lookup for all symbols.
			const inDegreeCypher = `
				UNWIND $symbols AS sym
				MATCH (s {name: sym.name})<-[r]-()
				WHERE s.file = sym.file
				RETURN { key: sym.key, inDegree: count(r) } AS entry
			`;

			const degreeResult = await db.query(inDegreeCypher, {
				symbols: symbolEntries,
			});

			for (const record of degreeResult.rows ?? []) {
				const cell = record[0];
				if (typeof cell === 'object' && cell !== null && 'key' in cell) {
					const key = String((cell as any).key);
					const inDegreeValue =
						typeof (cell as any).inDegree === 'number'
							? (cell as any).inDegree
							: Number((cell as any).inDegree ?? 0);
					if (!Number.isNaN(inDegreeValue)) {
						inDegreeByKey.set(key, inDegreeValue);
					}
				}
			}
		} catch {
			// If the batched graph query fails, fall back to semantic scores only.
		}
	}

	for (const result of results) {
		let structuralImportance = 0;

		if (result.symbolName && result.filePath) {
			const key = `${result.symbolName}::${result.filePath}`;
			const inDegree = inDegreeByKey.get(key) ?? 0;
			// Normalize: log scale to prevent highly-referenced symbols from dominating
			structuralImportance = Math.log2(1 + inDegree) / 10;
		}
		// Combined score: 80% semantic + 20% structural
		const relevanceScore = result.score * 0.8 + structuralImportance * 0.2;

		ranked.push({
			...result,
			relevanceScore,
			structuralImportance,
		});
	}

	return ranked;
}
