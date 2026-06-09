/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import type { CodeUsage, CodeUsages, Container, FileCodeUsage, FilePath, LineRange } from './protocol';
import type { ComputeContextSession } from './contextProvider';
import tss, { type TokenInfo } from './typescripts';

enum CodeUsageKind {
	Declaration = 'declaration',
	Reference = 'reference',
	Implementation = 'implementation'
}

export class CodeUsageProvider {

	private readonly session: ComputeContextSession;
	private readonly languageService: tt.LanguageService;
	private readonly document: FilePath;
	private readonly line: number;
	private readonly offset: number;
	private readonly position: number;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, document: FilePath, line: number, offset: number, position: number) {
		this.session = session;
		this.languageService = languageService;
		this.document = document;
		this.line = line;
		this.offset = offset;
		this.position = position;
	}

	public getCodeUsages(): CodeUsages {
		const program = this.languageService.getProgram();
		if (!program) {
			throw new Error('No program available');
		}
		const sourceFile = program.getSourceFile(this.document);
		if (!sourceFile) {
			throw new Error('No source file available');
		}
		const seen: Set<string> = new Set();
		const definitions: Map<string, FileCodeUsage> = new Map();
		const references: Map<string, FileCodeUsage> = new Map();
		const implementations: Map<string, FileCodeUsage> = new Map();
		const tokenInfo: TokenInfo = tss.getRelevantTokens(sourceFile, this.position);
		const token = tokenInfo.touching ?? tokenInfo.token;
		if (!token) {
			throw new Error('No token found at position');
		}
		const symbol = program.getTypeChecker().getSymbolAtLocation(token);
		if (!symbol) {
			throw new Error('No symbol found for token');
		}
		const result: CodeUsages = { symbol: symbol.getName() };
		const refs = this.session.getReferences(this.document, this.line, this.offset);
		if (refs) {
			for (const referencedSymbol of refs) {
				const definition = referencedSymbol.definition;
				if (definition) {
					this.getCodeUsage(seen, definitions, CodeUsageKind.Declaration, definition.fileName, definition.textSpan.start);
				}
			}
		}
		const impls = this.session.getImplementation(this.document, this.line, this.offset);
		if (impls) {
			for (const implementation of impls) {
				this.getCodeUsage(seen, implementations, CodeUsageKind.Implementation, implementation.fileName, implementation.textSpan.start);
			}
		}
		if (refs) {
			for (const referencedSymbol of refs) {
				for (const reference of referencedSymbol.references) {
					this.getCodeUsage(seen, references, CodeUsageKind.Reference, reference.fileName, reference.textSpan.start);
				}
			}
		}
		if (definitions.size > 0) {
			result.definitions = Array.from(definitions.values());
		}
		if (references.size > 0) {
			result.references = Array.from(references.values());
		}
		if (implementations.size > 0) {
			result.implementations = Array.from(implementations.values());
		}
		return result;
	}

	private getCodeUsage(seen: Set<string>, collection: Map<string, FileCodeUsage>, kind: CodeUsageKind, fileName: FilePath, pos: number): void {
		const fileAndProject = this.session.getFileAndProject(fileName);
		if (!fileAndProject) {
			return;
		}
		const { file, project } = fileAndProject;
		const sourceFile = project.getLanguageService().getProgram()?.getSourceFile(file);
		if (!sourceFile) {
			return;
		}
		const key = `${file}:${pos}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		const containers = this.getContainers(sourceFile, pos, kind);
		let fileCodeUsage: FileCodeUsage | undefined = collection.get(file);
		if (fileCodeUsage === undefined) {
			fileCodeUsage = {
				file: fileName,
				usages: []
			};
			collection.set(file, fileCodeUsage);
		}
		fileCodeUsage.usages.push({
			line: sourceFile.getLineAndCharacterOfPosition(pos).line,
			containers: containers
		});
	}

	private getContainers(sourceFile: tt.SourceFile, position: number, kind: CodeUsageKind): Container[] | undefined {
		const tokenInfo: TokenInfo = tss.getRelevantTokens(sourceFile, position);
		const node = tokenInfo.touching ?? tokenInfo.token;
		if (!node) {
			return;
		}

		const result: Container[] = [];
		for (let parent: tt.Node | undefined = node.parent; parent; parent = parent.parent) {
			if (ts.isSourceFile(parent)) {
				if (result.length === 0) {
					const line = sourceFile.getLineAndCharacterOfPosition(position).line;
					const lineRange = this.toLineRange(line, line);
					result.push({
						kind: 'sourceFile',
						name: this.session.host.path.basename(sourceFile.fileName),
						range: lineRange
					});
				}
				break;
			}

			const namedStructuralEntity = this.isNamedStructuralEntity(parent, kind);
			if (namedStructuralEntity !== undefined) {
				let { kind, name, rangeNode } = namedStructuralEntity;
				rangeNode ??= parent;
				const lineRange = this.toLineRange(
					sourceFile.getLineAndCharacterOfPosition(rangeNode.getStart(sourceFile)).line,
					sourceFile.getLineAndCharacterOfPosition(rangeNode.getEnd()).line
				);
				result.push({
					kind,
					name,
					range: lineRange
				});
			}
		}
		return result.length > 0 ? result : undefined;
	}

	private isNamedStructuralEntity(node: tt.Node, kind: CodeUsageKind): { kind: string; name?: string; rangeNode?: tt.Node } | undefined {
		let name: string | undefined;
		const parent: tt.Node | undefined = node.parent;
		switch (node.kind) {
			case ts.SyntaxKind.FunctionDeclaration:
				name = (node as tt.FunctionDeclaration).name?.text;
				return name ? { kind: 'function', name } : undefined;
			case ts.SyntaxKind.Constructor:
				return { kind: 'constructor', name: 'constructor' };
			case ts.SyntaxKind.MethodDeclaration:
				name = (node as tt.MethodDeclaration).name?.getText();
				return name ? { kind: 'method', name } : undefined;
			case ts.SyntaxKind.MethodSignature:
				if (kind === CodeUsageKind.Declaration) {
					name = (node as tt.MethodSignature).name?.getText();
					return name ? { kind: 'method', name } : undefined;
				}
				return undefined;
			case ts.SyntaxKind.ArrowFunction:
				if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
					name = parent.name.text;
					// We use kind 'function' for arrow functions that are properties because from a usage perspective
					// they are more similar to named functions or methods than to anonymous functions.
					return name ? { kind: 'function', name, rangeNode: parent } : undefined;
				} else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
					name = parent.name.text;
					return name ? { kind: 'arrow-function', name, rangeNode: parent } : undefined;
				} else if (ts.isCallExpression(parent)) {
					return { kind: 'arrow-function', rangeNode: parent };
				}
				return { kind: 'arrow-function' };
			case ts.SyntaxKind.PropertyDeclaration:
				name = (node as tt.PropertyDeclaration).name?.getText();
				return name ? { kind: 'property', name } : undefined;
			case ts.SyntaxKind.PropertySignature:
				if (kind === CodeUsageKind.Declaration) {
					name = (node as tt.PropertySignature).name?.getText();
					return name ? { kind: 'property', name } : undefined;
				}
				return undefined;
			case ts.SyntaxKind.GetAccessor:
				name = (node as tt.GetAccessorDeclaration).name?.getText();
				return name ? { kind: 'getter', name } : undefined;
			case ts.SyntaxKind.SetAccessor:
				name = (node as tt.SetAccessorDeclaration).name?.getText();
				return name ? { kind: 'setter', name } : undefined;
			case ts.SyntaxKind.ClassDeclaration:
				name = (node as tt.ClassDeclaration).name?.text;
				return name ? { kind: 'class', name } : undefined;
			case ts.SyntaxKind.InterfaceDeclaration:
				name = (node as tt.InterfaceDeclaration).name?.text;
				return name ? { kind: 'interface', name } : undefined;
			case ts.SyntaxKind.ModuleDeclaration:
				name = (node as tt.ModuleDeclaration).name?.text;
				return name ? { kind: 'module', name } : undefined;
			default:
				return undefined;
		}
	}

	private toLineRange(startLine: number, endLine: number): LineRange {
		return { start: startLine, end: endLine };
	}
}
