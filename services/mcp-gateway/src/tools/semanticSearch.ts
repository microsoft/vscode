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

	for (const result of results) {
		let structuralImportance = 0;

		if (result.symbolName) {
			try {
				// Count in-degree: how many other symbols reference this one
				const inDegreeCypher = `
					MATCH (s {name: $name})<-[r]-()
					WHERE s.file = $file
					RETURN count(r) AS inDegree
				`;
				const degreeResult = await db.query(inDegreeCypher, {
					name: result.symbolName,
					file: result.filePath,
				});

				if (degreeResult.rows.length > 0) {
					const record = degreeResult.rows[0];
					const cell = record[0];
					const inDegree = typeof cell === 'object' && cell !== null && 'inDegree' in cell
						? Number(cell.inDegree)
						: 0;
					// Normalize: log scale to prevent highly-referenced symbols from dominating
					structuralImportance = Math.log2(1 + inDegree) / 10;
				}
			} catch {
				// If graph query fails, just use semantic score alone
			}
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
