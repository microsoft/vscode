// Son of Anton — Graph Writer
// Writes extracted symbols and relationships to FalkorDB.

import { FalkorDBClient } from '../clients/falkordb';
import {
	FileExtractionResult,
	ExtractedFunction,
	ExtractedClass,
	ExtractedType,
	ExtractedImport,
	CallSite,
} from '../extractors/symbolExtractor';

export class GraphWriter {
	private readonly db: FalkorDBClient;

	constructor(db: FalkorDBClient) {
		this.db = db;
	}

	/**
	 * Write all extracted data for a single file to the graph.
	 * This replaces any existing data for the file.
	 */
	async writeFile(
		filePath: string,
		language: string,
		contentHash: string,
		lineCount: number,
		extraction: FileExtractionResult
	): Promise<void> {
		// Delete existing data for this file first
		await this.db.deleteFileData(filePath);

		// Create the file node
		await this.db.write(
			`CREATE (:File {
				path: $path,
				language: $language,
				lastModified: $lastModified,
				hash: $hash,
				lineCount: $lineCount
			})`,
			{
				path: filePath,
				language,
				lastModified: Date.now(),
				hash: contentHash,
				lineCount,
			}
		);

		// Write all symbols and relationships
		await this.writeFunctions(filePath, extraction.functions);
		await this.writeClasses(filePath, extraction.classes);
		await this.writeTypes(filePath, extraction.types);
		await this.writeImports(filePath, extraction.imports);
		await this.writeCallSites(extraction.callSites);
	}

	private async writeFunctions(filePath: string, functions: ExtractedFunction[]): Promise<void> {
		for (const fn of functions) {
			if (fn.isMethod) {
				// Methods are written as part of their class
				continue;
			}

			// Create function node and CONTAINS edge
			await this.db.write(
				`MATCH (f:File {path: $filePath})
				CREATE (fn:Function {
					name: $name,
					qualifiedName: $qualifiedName,
					file: $filePath,
					startLine: $startLine,
					endLine: $endLine,
					async: $async,
					exported: $exported,
					isMethod: $isMethod,
					isStatic: $isStatic,
					isConstructor: $isConstructor,
					signature: $signature,
					contentHash: $contentHash
				})
				CREATE (f)-[:CONTAINS]->(fn)`,
				{
					filePath,
					name: fn.name,
					qualifiedName: fn.qualifiedName,
					startLine: fn.startLine,
					endLine: fn.endLine,
					async: fn.async,
					exported: fn.exported,
					isMethod: fn.isMethod,
					isStatic: fn.isStatic,
					isConstructor: fn.isConstructor,
					signature: fn.signature,
					contentHash: fn.contentHash,
				}
			);

			// Create EXPORTS edge if exported
			if (fn.exported) {
				await this.db.write(
					`MATCH (f:File {path: $filePath}), (fn:Function {qualifiedName: $qualifiedName, file: $filePath})
					CREATE (f)-[:EXPORTS]->(fn)`,
					{ filePath, qualifiedName: fn.qualifiedName }
				);
			}

			// Create RETURNS edge if return type matches a known type
			if (fn.returnType) {
				await this.db.write(
					`MATCH (fn:Function {qualifiedName: $qualifiedName, file: $filePath}),
						(t:Type {name: $returnType})
					CREATE (fn)-[:RETURNS]->(t)`,
					{ filePath, qualifiedName: fn.qualifiedName, returnType: fn.returnType }
				);
			}

			// Create ACCEPTS edges for parameters with known types
			for (const param of fn.parameters) {
				if (param.type) {
					await this.db.write(
						`MATCH (fn:Function {qualifiedName: $qualifiedName, file: $filePath}),
							(t:Type {name: $paramType})
						CREATE (fn)-[:ACCEPTS {paramName: $paramName, position: $position}]->(t)`,
						{
							filePath,
							qualifiedName: fn.qualifiedName,
							paramType: param.type,
							paramName: param.name,
							position: param.position,
						}
					);
				}
			}
		}
	}

	private async writeClasses(filePath: string, classes: ExtractedClass[]): Promise<void> {
		for (const cls of classes) {
			// Create class node and CONTAINS edge
			await this.db.write(
				`MATCH (f:File {path: $filePath})
				CREATE (c:Class {
					name: $name,
					file: $filePath,
					startLine: $startLine,
					endLine: $endLine,
					abstract: $abstract,
					exported: $exported,
					contentHash: $contentHash
				})
				CREATE (f)-[:CONTAINS]->(c)`,
				{
					filePath,
					name: cls.name,
					startLine: cls.startLine,
					endLine: cls.endLine,
					abstract: cls.abstract,
					exported: cls.exported,
					contentHash: cls.contentHash,
				}
			);

			// Create EXPORTS edge if exported
			if (cls.exported) {
				await this.db.write(
					`MATCH (f:File {path: $filePath}), (c:Class {name: $name, file: $filePath})
					CREATE (f)-[:EXPORTS]->(c)`,
					{ filePath, name: cls.name }
				);
			}

			// Create EXTENDS edge
			if (cls.extends) {
				await this.db.write(
					`MATCH (c:Class {name: $name, file: $filePath}),
						(parent:Class {name: $parentName})
					CREATE (c)-[:EXTENDS]->(parent)`,
					{ filePath, name: cls.name, parentName: cls.extends }
				);
			}

			// Create IMPLEMENTS edges
			for (const ifaceName of cls.implements) {
				await this.db.write(
					`MATCH (c:Class {name: $name, file: $filePath}),
						(iface:Type {name: $ifaceName})
					CREATE (c)-[:IMPLEMENTS]->(iface)`,
					{ filePath, name: cls.name, ifaceName }
				);
			}

			// Write methods
			for (const method of cls.methods) {
				await this.db.write(
					`MATCH (c:Class {name: $className, file: $filePath})
					CREATE (m:Function {
						name: $name,
						qualifiedName: $qualifiedName,
						file: $filePath,
						startLine: $startLine,
						endLine: $endLine,
						async: $async,
						exported: false,
						isMethod: true,
						isStatic: $isStatic,
						isConstructor: $isConstructor,
						signature: $signature,
						contentHash: $contentHash
					})
					CREATE (c)-[:HAS_METHOD]->(m)`,
					{
						filePath,
						className: cls.name,
						name: method.name,
						qualifiedName: method.qualifiedName,
						startLine: method.startLine,
						endLine: method.endLine,
						async: method.async,
						isStatic: method.isStatic,
						isConstructor: method.isConstructor,
						signature: method.signature,
						contentHash: method.contentHash,
					}
				);
			}
		}
	}

	private async writeTypes(filePath: string, types: ExtractedType[]): Promise<void> {
		for (const t of types) {
			await this.db.write(
				`MATCH (f:File {path: $filePath})
				CREATE (tp:Type {
					name: $name,
					kind: $kind,
					file: $filePath,
					startLine: $startLine,
					endLine: $endLine,
					exported: $exported,
					contentHash: $contentHash
				})
				CREATE (f)-[:CONTAINS]->(tp)`,
				{
					filePath,
					name: t.name,
					kind: t.typeKind,
					startLine: t.startLine,
					endLine: t.endLine,
					exported: t.exported,
					contentHash: t.contentHash,
				}
			);

			if (t.exported) {
				await this.db.write(
					`MATCH (f:File {path: $filePath}), (tp:Type {name: $name, file: $filePath})
					CREATE (f)-[:EXPORTS]->(tp)`,
					{ filePath, name: t.name }
				);
			}
		}
	}

	private async writeImports(filePath: string, imports: ExtractedImport[]): Promise<void> {
		for (const imp of imports) {
			// Create import node
			await this.db.write(
				`CREATE (:Import {
					source: $source,
					specifiers: $specifiers,
					file: $file,
					line: $line,
					isDefault: $isDefault,
					isNamespace: $isNamespace
				})`,
				{
					source: imp.source,
					specifiers: imp.specifiers.join(', '),
					file: filePath,
					line: imp.line,
					isDefault: imp.isDefault,
					isNamespace: imp.isNamespace,
				}
			);

			// Try to create IMPORTS edge between files
			// Resolve the import source to a file path (best effort)
			const rawSource = imp.source;
			// Normalize the source by stripping leading "./" or "/" segments.
			const normalizedSource = rawSource.replace(/^(?:\.\/|\/)+/, '');
			// Generate a small set of plausible file suffixes to match against.
			const sourceCandidates = [
				normalizedSource,
				`${normalizedSource}.ts`,
				`${normalizedSource}.tsx`,
				`${normalizedSource}.js`,
				`${normalizedSource}.jsx`,
				`${normalizedSource}/index.ts`,
				`${normalizedSource}/index.tsx`,
				`${normalizedSource}/index.js`,
				`${normalizedSource}/index.jsx`,
			];

			await this.db.write(
				`MATCH (src:File {path: $srcPath}), (tgt:File)
				WHERE tgt.path ENDS WITH $source1
					OR tgt.path ENDS WITH $source2
					OR tgt.path ENDS WITH $source3
					OR tgt.path ENDS WITH $source4
					OR tgt.path ENDS WITH $source5
					OR tgt.path ENDS WITH $source6
					OR tgt.path ENDS WITH $source7
					OR tgt.path ENDS WITH $source8
					OR tgt.path ENDS WITH $source9
				CREATE (src)-[:IMPORTS {specifiers: $specifiers, line: $line}]->(tgt)`,
				{
					srcPath: filePath,
					source1: sourceCandidates[0],
					source2: sourceCandidates[1],
					source3: sourceCandidates[2],
					source4: sourceCandidates[3],
					source5: sourceCandidates[4],
					source6: sourceCandidates[5],
					source7: sourceCandidates[6],
					source8: sourceCandidates[7],
					source9: sourceCandidates[8],
					specifiers: imp.specifiers.join(', '),
					line: imp.line,
				}
			);
		}
	}

	private async writeCallSites(callSites: CallSite[]): Promise<void> {
		for (const call of callSites) {
			if (!call.callerName || !call.calledName) {
				continue;
			}

			// Create CALLS edge between functions (best effort matching by name)
			await this.db.write(
				`MATCH (caller:Function {name: $callerName}),
					(called:Function {name: $calledName})
				WHERE caller <> called
				CREATE (caller)-[:CALLS {line: $line, column: $column}]->(called)`,
				{
					callerName: call.callerName,
					calledName: call.calledName,
					line: call.line,
					column: call.column,
				}
			);
		}
	}
}
