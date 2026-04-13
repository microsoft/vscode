// Son of Anton — LSIF Graph Writer
// Writes LSIF/SCIP cross-reference data to FalkorDB, enriching the graph
// created by the Tree-sitter indexer with precise cross-file relationships.

import { FalkorDBClient } from "../clients/falkordb";
import {
	LsifParseResult,
	SymbolDefinition,
	SymbolReference,
	TypeRelation,
} from "../parsers/lsifParser";

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
					console.warn(
						"[lsif-writer] Error writing reference:",
						err instanceof Error ? err.message : err,
					);
				}
			}
		}

		// Write type relations (EXTENDS, IMPLEMENTS)
		const extendsRels = result.typeRelations.filter(
			(rel) => rel.relationType === "extends",
		);
		const implementsRels = result.typeRelations.filter(
			(rel) => rel.relationType === "implements",
		);

		try {
			if (extendsRels.length > 0) {
				await this.db.write(
					`UNWIND $relations AS rel
					MATCH (child:Class {name: rel.childName}), (parent:Class {name: rel.parentName})
					MERGE (child)-[:EXTENDS]->(parent)`,
					{ relations: extendsRels },
				);
				stats.typeRelationsWritten += extendsRels.length;
			}
			if (implementsRels.length > 0) {
				await this.db.write(
					`UNWIND $relations AS rel
					MATCH (child:Class {name: rel.childName}), (iface:Type {name: rel.parentName})
					MERGE (child)-[:IMPLEMENTS]->(iface)`,
					{ relations: implementsRels },
				);
				stats.typeRelationsWritten += implementsRels.length;
			}
		} catch (err) {
			stats.errors += extendsRels.length + implementsRels.length;
			console.warn(
				"[lsif-writer] Error writing type relations:",
				err instanceof Error ? err.message : err,
			);
		}

		console.log(
			`[lsif-writer] Written: ${stats.referencesWritten} references, ` +
				`${stats.callsWritten} calls, ` +
				`${stats.typeRelationsWritten} type relations, ` +
				`${stats.errors} errors`,
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
			},
		);

		// If the reference is a call, also create a CALLS edge
		if (ref.kind === "call") {
			await this.db.write(
				`MATCH (caller:Function)
				WHERE caller.file = $refFile
					AND caller.startLine <= $refLine
					AND caller.endLine >= $refLine
				MATCH (called:Function {name: $symbolName})
				WHERE called.file = $defFile OR $defFile = ''
				MERGE (caller)-[:CALLS {line: $refLine, column: $refColumn}]->(called)`,
				{
					refFile: ref.referenceFile,
					refLine: ref.referenceLine,
					symbolName: ref.symbolName,
					defFile: ref.definitionFile,
					refColumn: ref.referenceColumn,
				},
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
