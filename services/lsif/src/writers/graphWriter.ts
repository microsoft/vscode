// Son of Anton — LSIF Graph Writer
// Writes LSIF/SCIP cross-reference data to FalkorDB, enriching the graph
// created by the Tree-sitter indexer with precise cross-file relationships.

import { FalkorDBClient } from '../clients/falkordb';
import { LsifParseResult, SymbolDefinition, SymbolReference, TypeRelation } from '../parsers/lsifParser';

export class LsifGraphWriter {
	private readonly db: FalkorDBClient;

	constructor(db: FalkorDBClient) {
		this.db = db;
	}

	/**
	 * Write parsed LSIF/SCIP data to the graph.
	 * This enriches existing nodes (created by Tree-sitter) with precise cross-references.
	 */
	async writeParseResult(result: LsifParseResult): Promise<WriteStats> {
		const stats: WriteStats = {
			referencesWritten: 0,
			callsWritten: 0,
			typeRelationsWritten: 0,
			errors: 0,
		};

		// Write REFERENCES edges
		for (const ref of result.references) {
			try {
				await this.writeReference(ref);
				stats.referencesWritten++;
			} catch (err) {
				stats.errors++;
				if (stats.errors <= 10) {
					console.warn('[lsif-writer] Error writing reference:', err instanceof Error ? err.message : err);
				}
			}
		}

		// Write type relations (EXTENDS, IMPLEMENTS)
		for (const rel of result.typeRelations) {
			try {
				await this.writeTypeRelation(rel);
				stats.typeRelationsWritten++;
			} catch (err) {
				stats.errors++;
			}
		}

		console.log(
			`[lsif-writer] Written: ${stats.referencesWritten} references, ` +
			`${stats.callsWritten} calls, ` +
			`${stats.typeRelationsWritten} type relations, ` +
			`${stats.errors} errors`
		);

		return stats;
	}

	/**
	 * Write a REFERENCES edge between symbols.
	 * Matches against existing Function/Class/Type nodes by name and file.
	 */
	private async writeReference(ref: SymbolReference): Promise<void> {
		// Try to match reference to existing nodes
		// First try: match by function name in the reference file
		await this.db.write(
			`MATCH (source:Function)
			WHERE source.file = $refFile
				AND source.startLine <= $refLine
				AND source.endLine >= $refLine
			MATCH (target:Function {name: $symbolName})
			WHERE target.file = $defFile OR $defFile = ''
			CREATE (source)-[:REFERENCES {line: $refLine, column: $refColumn, kind: $kind}]->(target)`,
			{
				refFile: ref.referenceFile,
				refLine: ref.referenceLine,
				symbolName: ref.symbolName,
				defFile: ref.definitionFile,
				refColumn: ref.referenceColumn,
				kind: ref.kind,
			}
		);

		// If the reference is a call, also create a CALLS edge
		if (ref.kind === 'call') {
			await this.db.write(
				`MATCH (caller:Function)
				WHERE caller.file = $refFile
					AND caller.startLine <= $refLine
					AND caller.endLine >= $refLine
				MATCH (called:Function {name: $symbolName})
				CREATE (caller)-[:CALLS {line: $refLine, column: $refColumn}]->(called)`,
				{
					refFile: ref.referenceFile,
					refLine: ref.referenceLine,
					symbolName: ref.symbolName,
					refColumn: ref.referenceColumn,
				}
			);
		}
	}

	/**
	 * Write EXTENDS or IMPLEMENTS edges from LSIF type hierarchy data.
	 */
	private async writeTypeRelation(rel: TypeRelation): Promise<void> {
		if (rel.relationType === 'extends') {
			await this.db.write(
				`MATCH (child:Class {name: $childName}), (parent:Class {name: $parentName})
				MERGE (child)-[:EXTENDS]->(parent)`,
				{ childName: rel.childName, parentName: rel.parentName }
			);
		} else if (rel.relationType === 'implements') {
			await this.db.write(
				`MATCH (child:Class {name: $childName}), (iface:Type {name: $parentName})
				MERGE (child)-[:IMPLEMENTS]->(iface)`,
				{ childName: rel.childName, parentName: rel.parentName }
			);
		}
	}
}

export interface WriteStats {
	referencesWritten: number;
	callsWritten: number;
	typeRelationsWritten: number;
	errors: number;
}
