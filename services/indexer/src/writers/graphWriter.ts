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
		const exportedFunctions: string[] = [];
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
				exportedFunctions.push(fn.qualifiedName);
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

		if (exportedFunctions.length > 0) {
			await this.db.write(
				`MATCH (f:File {path: $filePath})
				UNWIND $exportedNames AS qName
				MATCH (fn:Function {qualifiedName: qName, file: $filePath})
				CREATE (f)-[:EXPORTS]->(fn)`,
				{ filePath, exportedNames: exportedFunctions }
			);
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
			if (cls.methods.length > 0) {
				const methodsData = cls.methods.map(method => ({
					name: method.name,
					qualifiedName: method.qualifiedName,
					startLine: method.startLine,
					endLine: method.endLine,
					async: method.async,
					isStatic: method.isStatic,
					isConstructor: method.isConstructor,
					signature: method.signature,
					contentHash: method.contentHash,
				}));

				await this.db.write(
					`MATCH (c:Class {name: $className, file: $filePath})
					UNWIND $methods AS method
					CREATE (m:Function {
						name: method.name,
						qualifiedName: method.qualifiedName,
						file: $filePath,
						startLine: method.startLine,
						endLine: method.endLine,
						async: method.async,
						exported: false,
						isMethod: true,
						isStatic: method.isStatic,
						isConstructor: method.isConstructor,
						signature: method.signature,
						contentHash: method.contentHash
					})
					CREATE (c)-[:HAS_METHOD]->(m)`,
					{
						filePath,
						className: cls.name,
						methods: methodsData,
					}
				);
			}
		}

		// Batch create EXPORTS edges for classes
		const exportedClassNames = classes.filter(c => c.exported).map(c => c.name);
		if (exportedClassNames.length > 0) {
			await this.db.write(
				`MATCH (f:File {path: $filePath})
				UNWIND $classNames AS className
				MATCH (c:Class {name: className, file: $filePath})
				CREATE (f)-[:EXPORTS]->(c)`,
				{ filePath, classNames: exportedClassNames }
			);
		}
	}

	private async writeTypes(filePath: string, types: ExtractedType[]): Promise<void> {
		if (types.length === 0) {
			return;
		}

		await this.db.write(
			`MATCH (f:File {path: $filePath})
			UNWIND $types AS t
			CREATE (tp:Type {
				name: t.name,
				kind: t.kind,
				file: $filePath,
				startLine: t.startLine,
				endLine: t.endLine,
				exported: t.exported,
				contentHash: t.contentHash
			})
			CREATE (f)-[:CONTAINS]->(tp)
			WITH f, tp, t
			WHERE t.exported = true
			CREATE (f)-[:EXPORTS]->(tp)`,
			{
				filePath,
				types: types.map(t => ({
					name: t.name,
					kind: t.typeKind,
					startLine: t.startLine,
					endLine: t.endLine,
					exported: t.exported,
					contentHash: t.contentHash,
				}))
			}
		);
	}

	private async writeImports(filePath: string, imports: ExtractedImport[]): Promise<void> {
		if (imports.length === 0) {
			return;
		}

		// Prepare data for UNWIND nodes
		const importNodes = imports.map((imp) => ({
			source: imp.source,
			specifiers: imp.specifiers.join(', '),
			file: filePath,
			line: imp.line,
			isDefault: imp.isDefault,
			isNamespace: imp.isNamespace,
		}));

		// Create import nodes in a batch
		await this.db.write(
			`UNWIND $imports AS imp
			CREATE (:Import {
				source: imp.source,
				specifiers: imp.specifiers,
				file: imp.file,
				line: imp.line,
				isDefault: imp.isDefault,
				isNamespace: imp.isNamespace
			})`,
			{ imports: importNodes }
		);

		// Prepare data for UNWIND edges
		const importEdges = imports.map((imp) => {
			const rawSource = imp.source;
			const normalizedSource = rawSource.replace(/^(?:\.\/|\/)+/, '');
			return {
				specifiers: imp.specifiers.join(', '),
				line: imp.line,
				source1: normalizedSource,
				source2: `${normalizedSource}.ts`,
				source3: `${normalizedSource}.tsx`,
				source4: `${normalizedSource}.js`,
				source5: `${normalizedSource}.jsx`,
				source6: `${normalizedSource}/index.ts`,
				source7: `${normalizedSource}/index.tsx`,
				source8: `${normalizedSource}/index.js`,
				source9: `${normalizedSource}/index.jsx`,
			};
		});

		// Create IMPORTS edges in a batch
		await this.db.write(
			`MATCH (src:File {path: $srcPath})
			UNWIND $edges AS edge
			MATCH (tgt:File)
			WHERE tgt.path ENDS WITH edge.source1
				OR tgt.path ENDS WITH edge.source2
				OR tgt.path ENDS WITH edge.source3
				OR tgt.path ENDS WITH edge.source4
				OR tgt.path ENDS WITH edge.source5
				OR tgt.path ENDS WITH edge.source6
				OR tgt.path ENDS WITH edge.source7
				OR tgt.path ENDS WITH edge.source8
				OR tgt.path ENDS WITH edge.source9
			CREATE (src)-[:IMPORTS {specifiers: edge.specifiers, line: edge.line}]->(tgt)`,
			{
				srcPath: filePath,
				edges: importEdges
			}
		);
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
