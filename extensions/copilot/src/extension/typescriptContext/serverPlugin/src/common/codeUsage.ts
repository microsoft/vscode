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

export function getCodeUsages(session: ComputeContextSession, languageService: tt.LanguageService, document: FilePath, position: number): CodeUsages {
	const program = languageService.getProgram();
	if (!program) {
		throw new Error('No program available');
	}
	const sourceFile = program.getSourceFile(document);
	if (!sourceFile) {
		throw new Error('No source file available');
	}
	const definitions: Map<string, CodeUsage> = new Map();
	const references: Map<string, CodeUsage> = new Map();
	const implementations: Map<string, CodeUsage> = new Map();
	const result: CodeUsages = {};
	for (const ls of session.getLanguageServices(sourceFile)) {
		const refs = ls.findReferences(document, position);
		if (refs) {
			for (const referencedSymbol of refs) {
				const definition = referencedSymbol.definition;
				if (definition) {
					getCodeUsage(definitions, program, definition.fileName, definition.textSpan.start);
				}
				for (const reference of referencedSymbol.references) {
					getCodeUsage(references, program, reference.fileName, reference.textSpan.start);
				}
			}
		}
		const impls = languageService.getImplementationAtPosition(document, position);
		if (impls) {
			for (const implementation of impls) {
				getCodeUsage(implementations, program, implementation.fileName, implementation.textSpan.start);
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

function getCodeUsage(collection: Map<string, CodeUsage>, program: tt.Program, fileName: FilePath, pos: number): void {
	const sourceFile = program.getSourceFile(fileName);
	if (!sourceFile) {
		return;
	}
	const key = `${fileName}:${pos}`;
	if (!collection.has(key)) {
		const parentRanges = getParentRanges(sourceFile, pos);
		collection.set(key, {
			file: fileName,
			line: sourceFile.getLineAndCharacterOfPosition(pos).line,
			parents: parentRanges
		});
	}
}

function getParentRanges(sourceFile: tt.SourceFile, position: number): LineRange[] | undefined {
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

		if (isNamedStructuralEntity(parent)) {
			result.push(toLineRange(
				sourceFile.getLineAndCharacterOfPosition(parent.getStart(sourceFile)).line,
				sourceFile.getLineAndCharacterOfPosition(parent.getEnd()).line
			));
		}
	}
	return result.length > 0 ? result : undefined;
}

function isNamedStructuralEntity(node: tt.Node): boolean {
	return (ts.isFunctionDeclaration(node)
		|| ts.isMethodDeclaration(node)
		|| ts.isPropertyDeclaration(node)
		|| ts.isPropertySignature(node)
		|| ts.isGetAccessorDeclaration(node)
		|| ts.isSetAccessorDeclaration(node)
		|| ts.isClassDeclaration(node)
		|| ts.isModuleDeclaration(node))
		&& !!node.name;
}

function toLineRange(startLine: number, endLine: number): LineRange {
	return { start: startLine, end: endLine };
}
