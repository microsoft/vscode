/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import type { CodeUsage, CodeUsages, FilePath, LineRange } from './protocol';
import type { ComputeContextSession } from './contextProvider';
import tss, { type TokenInfo } from './typescripts';

enum CodeUsageKind {
	Declaration = 'declaration',
	Reference = 'reference',
	Implementation = 'implementation'
}

export function getCodeUsages(session: ComputeContextSession, languageService: tt.LanguageService, document: FilePath, position: number): CodeUsages {
	const program = languageService.getProgram();
	if (!program) {
		throw new Error('No program available');
	}
	const sourceFile = program.getSourceFile(document);
	if (!sourceFile) {
		throw new Error('No source file available');
	}
	const seen: Set<string> = new Set();
	const definitions: CodeUsage[] = [];
	const references: CodeUsage[] = [];
	const implementations: CodeUsage[] = [];
	const result: CodeUsages = {};
	for (const ls of session.getLanguageServices(sourceFile)) {
		const refs = ls.findReferences(document, position);
		if (refs) {
			for (const referencedSymbol of refs) {
				const definition = referencedSymbol.definition;
				if (definition) {
					getCodeUsage(seen, definitions, CodeUsageKind.Declaration, program, definition.fileName, definition.textSpan.start);
				}
			}
		}
		const impls = languageService.getImplementationAtPosition(document, position);
		if (impls) {
			for (const implementation of impls) {
				getCodeUsage(seen, implementations, CodeUsageKind.Implementation, program, implementation.fileName, implementation.textSpan.start);
			}
		}
		if (refs) {
			for (const referencedSymbol of refs) {
				for (const reference of referencedSymbol.references) {
					getCodeUsage(seen, references, CodeUsageKind.Reference, program, reference.fileName, reference.textSpan.start);
				}
			}
		}
	}
	if (definitions.length > 0) {
		result.definitions = definitions;
	}
	if (references.length > 0) {
		result.references = references;
	}
	if (implementations.length > 0) {
		result.implementations = implementations;
	}
	return result;
}

function getCodeUsage(seen: Set<string>, collection: CodeUsage[], kind: CodeUsageKind, program: tt.Program, fileName: FilePath, pos: number): void {
	const sourceFile = program.getSourceFile(fileName);
	if (!sourceFile) {
		return;
	}
	const key = `${fileName}:${pos}`;
	if (seen.has(key)) {
		return;
	}
	seen.add(key);
	const parentRanges = getParentRanges(sourceFile, pos, kind);
	collection.push({
		file: fileName,
		line: sourceFile.getLineAndCharacterOfPosition(pos).line,
		parents: parentRanges
	});
}

function getParentRanges(sourceFile: tt.SourceFile, position: number, kind: CodeUsageKind): LineRange[] | undefined {
	const tokenInfo: TokenInfo = tss.getRelevantTokens(sourceFile, position);
	const node = tokenInfo.touching ?? tokenInfo.token;
	if (!node) {
		return;
	}

	const result: LineRange[] = [];
	for (let parent: tt.Node | undefined = node.parent; parent; parent = parent.parent) {
		if (ts.isSourceFile(parent)) {
			if (result.length === 0) {
				const line = sourceFile.getLineAndCharacterOfPosition(position).line;
				result.push(toLineRange(Math.max(0, line - 10), Math.min(sourceFile.getLineAndCharacterOfPosition(sourceFile.end).line, line + 10)));
			}
			break;
		}

		if (isNamedStructuralEntity(parent, kind)) {
			result.push(toLineRange(
				sourceFile.getLineAndCharacterOfPosition(parent.getStart(sourceFile)).line,
				sourceFile.getLineAndCharacterOfPosition(parent.getEnd()).line
			));
		}
	}
	return result.length > 0 ? result : undefined;
}

function isNamedStructuralEntity(node: tt.Node, kind: CodeUsageKind): boolean {
	return (ts.isFunctionDeclaration(node)
		|| ts.isConstructorDeclaration(node)
		|| ts.isMethodDeclaration(node)
		|| (ts.isMethodSignature(node) && kind === CodeUsageKind.Declaration)
		|| ts.isPropertyDeclaration(node)
		|| (ts.isPropertySignature(node) && kind === CodeUsageKind.Declaration)
		|| ts.isGetAccessorDeclaration(node)
		|| ts.isSetAccessorDeclaration(node)
		|| ts.isClassDeclaration(node)
		|| ts.isInterfaceDeclaration(node)
		|| ts.isModuleDeclaration(node))
		&& !!node.name;
}

function toLineRange(startLine: number, endLine: number): LineRange {
	return { start: startLine, end: endLine };
}
