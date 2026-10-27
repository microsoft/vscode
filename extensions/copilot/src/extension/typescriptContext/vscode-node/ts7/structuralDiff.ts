/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from '@typescript/native/unstable/ast';
import * as vscode from 'vscode';
import { CancellationError } from '../../../../util/vs/base/common/errors';
import { basename } from '../../../../util/vs/base/common/path';

interface Span {
	readonly start: number;
	readonly end: number;
}

interface EntityInfo {
	readonly name: string;
	readonly kind: vscode.SymbolKind;
	readonly languageKind: string;
	readonly node: ts.Node;
	readonly rangeNode: ts.Node;
	readonly nameNode?: ts.Node;
	readonly body?: ts.Node;
}

interface Entity {
	readonly value: vscode.StructuralDiffEntity;
	readonly node: ts.Node;
	readonly span: Span;
	readonly headerEnd: number;
	readonly implementation: readonly Span[];
	readonly isTest: boolean;
	readonly children: Entity[];
}

interface Source {
	readonly file: ts.SourceFile;
	readonly root: Entity;
	readonly dependencies: Span[];
	readonly tests: Span[];
}

interface MutableDiffNode extends vscode.StructuralDiffNode {
	readonly originalChanges: vscode.StructuralDiffCoverage[];
	readonly modifiedChanges: vscode.StructuralDiffCoverage[];
	readonly children: vscode.StructuralDiffNode[];
}

interface DiffTree {
	readonly original?: Entity;
	readonly modified?: Entity;
	readonly result: MutableDiffNode;
	readonly children: DiffTree[];
}

type Side = 'original' | 'modified';

/**
 * Matches uniquely named siblings and classifies supplied changes into a sparse lexical tree.
 */
export function computeStructuralDiff(originalFile: ts.SourceFile, modifiedFile: ts.SourceFile, context: vscode.StructuralDiffContext, token: vscode.CancellationToken): vscode.StructuralDiff {
	const checkCancellation = () => {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
	};
	const original = collectSource(originalFile, checkCancellation);
	const modified = collectSource(modifiedFile, checkCancellation);
	let nextId = 0;
	const merge = (left: Entity | undefined, right: Entity | undefined): DiffTree => {
		checkCancellation();
		const result: MutableDiffNode = {
			id: String(nextId++),
			original: left?.value,
			modified: right?.value,
			originalChanges: [],
			modifiedChanges: [],
			children: [],
		};
		const leftChildren = left?.children ?? [];
		const rightChildren = right?.children ?? [];
		const leftByKey = groupEntities(leftChildren);
		const rightByKey = groupEntities(rightChildren);
		const matched = new Set<Entity>();
		const children = rightChildren.map(child => {
			const key = entityKey(child);
			const candidates = leftByKey.get(key);
			const counterpart = candidates?.length === 1 && rightByKey.get(key)?.length === 1 ? candidates[0] : undefined;
			if (counterpart !== undefined) {
				matched.add(counterpart);
			}
			return merge(counterpart, child);
		});
		for (const child of leftChildren) {
			if (!matched.has(child)) {
				children.push(merge(child, undefined));
			}
		}
		return { original: left, modified: right, result, children };
	};
	const tree = merge(original.root, modified.root);
	for (const [textChangeIndex, change] of context.changes.entries()) {
		checkCancellation();
		classify(tree, 'original', original, textChangeIndex, fromRange(originalFile, change.originalRange), checkCancellation);
		classify(tree, 'modified', modified, textChangeIndex, fromRange(modifiedFile, change.modifiedRange), checkCancellation);
	}
	const prune = (node: DiffTree): vscode.StructuralDiffNode => {
		for (const child of node.children) {
			const result = prune(child);
			if (result.originalChanges.length > 0 || result.modifiedChanges.length > 0 || result.children.length > 0) {
				node.result.children.push(result);
			}
		}
		return node.result;
	};
	checkCancellation();
	return { root: prune(tree), isIncomplete: false };
}

function collectSource(file: ts.SourceFile, checkCancellation: () => void): Source {
	const root: Entity = {
		value: { name: basename(file.fileName), kind: vscode.SymbolKind.File, range: toRange(file, { start: 0, end: file.text.length }) },
		node: file,
		span: { start: 0, end: file.text.length },
		headerEnd: 0,
		implementation: file.statements.map(statement => nodeSpan(statement, file)),
		isTest: isTestFile(file.fileName),
		children: [],
	};
	const source: Source = { file, root, dependencies: [], tests: [] };
	const visit = (node: ts.Node, parent: Entity): void => {
		checkCancellation();
		if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined)) {
			source.dependencies.push(nodeSpan(node, file));
		}
		if (ts.isCallExpression(node) && isTestCallee(node.expression)) {
			for (const argument of node.arguments) {
				if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) {
					source.tests.push(nodeSpan(argument, file));
				}
			}
		}
		let container = parent;
		const info = node === parent.node ? undefined : getEntityInfo(node, file);
		if (info !== undefined) {
			const span = nodeSpan(info.rangeNode, file);
			if (span.start < span.end && contains(parent.span, span)) {
				const children = structuralChildren(info.node);
				const headerEnd = info.body?.getStart(file) ?? children[0]?.getStart(file) ?? span.end;
				container = {
					value: {
						name: info.name,
						kind: info.kind,
						languageKind: info.languageKind,
						range: toRange(file, span),
						selectionRange: info.nameNode === undefined ? undefined : toRange(file, nodeSpan(info.nameNode, file)),
					},
					node: info.node,
					span,
					headerEnd,
					implementation: bodySpans(info.body, file),
					isTest: parent.isTest || /^(?:it|test|spec)(?:$|[\s_.:-]|[A-Z])/.test(info.name),
					children: [],
				};
				parent.children.push(container);
			}
		}
		node.forEachChild(child => visit(child, container));
	};
	file.forEachChild(child => visit(child, root));
	return source;
}

function getEntityInfo(node: ts.Node, file: ts.SourceFile): EntityInfo | undefined {
	if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) {
		let rangeNode: ts.Node = node;
		if (ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent)
			&& node.parent.declarations.length === 1 && ts.isVariableStatement(node.parent.parent)) {
			rangeNode = node.parent.parent;
		}
		let initializer = node.initializer;
		while (initializer !== undefined && ts.isOuterExpression(initializer)) {
			initializer = initializer.expression;
		}
		const base = { name: node.name.getText(file), nameNode: node.name, rangeNode };
		if (initializer !== undefined) {
			if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
				return { ...base, node: initializer, kind: vscode.SymbolKind.Function, languageKind: ts.isArrowFunction(initializer) ? 'arrow-function' : 'function', body: initializer.body };
			}
			if (ts.isClassExpression(initializer)) {
				return { ...base, node: initializer, kind: vscode.SymbolKind.Class, languageKind: 'class' };
			}
			if (ts.isObjectLiteralExpression(initializer) || ts.isArrayLiteralExpression(initializer)) {
				return { ...base, node: initializer, kind: ts.isObjectLiteralExpression(initializer) ? vscode.SymbolKind.Object : vscode.SymbolKind.Array, languageKind: ts.isObjectLiteralExpression(initializer) ? 'object' : 'array', body: initializer };
			}
		}
		return { ...base, node, kind: ts.isVariableDeclaration(node) ? vscode.SymbolKind.Variable : vscode.SymbolKind.Property, languageKind: ts.isVariableDeclaration(node) ? 'variable' : 'property', body: node.initializer };
	}
	const base = { node, rangeNode: node };
	if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
		const name = node.name?.getText(file) ?? (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? 'default' : undefined);
		return name === undefined ? undefined : { ...base, name, nameNode: node.name, kind: vscode.SymbolKind.Class, languageKind: 'class' };
	}
	if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) {
		const kind = ts.isInterfaceDeclaration(node) ? vscode.SymbolKind.Interface
			: ts.isTypeAliasDeclaration(node) ? vscode.SymbolKind.Variable
				: ts.isEnumDeclaration(node) ? vscode.SymbolKind.Enum : vscode.SymbolKind.Module;
		const languageKind = ts.isInterfaceDeclaration(node) ? 'interface' : ts.isTypeAliasDeclaration(node) ? 'type-alias' : ts.isEnumDeclaration(node) ? 'enum' : 'module';
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind, languageKind, body: ts.isModuleDeclaration(node) ? node.body : undefined };
	}
	if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
		const name = node.name?.getText(file) ?? (ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? 'default' : undefined);
		return name === undefined ? undefined : { ...base, name, nameNode: node.name, kind: vscode.SymbolKind.Function, languageKind: 'function', body: node.body };
	}
	if (ts.isConstructorDeclaration(node)) {
		return { ...base, name: 'constructor', kind: vscode.SymbolKind.Constructor, languageKind: 'constructor', body: node.body };
	}
	if (ts.isMethodDeclaration(node) || ts.isMethodSignatureDeclaration(node)) {
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: vscode.SymbolKind.Method, languageKind: 'method', body: ts.isMethodDeclaration(node) ? node.body : undefined };
	}
	if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: vscode.SymbolKind.Property, languageKind: ts.isGetAccessorDeclaration(node) ? 'getter' : 'setter', body: node.body };
	}
	if (ts.isPropertySignatureDeclaration(node) || ts.isEnumMember(node)) {
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: ts.isEnumMember(node) ? vscode.SymbolKind.EnumMember : vscode.SymbolKind.Property, languageKind: ts.isEnumMember(node) ? 'enum-member' : 'property', body: ts.isEnumMember(node) ? node.initializer : undefined };
	}
	if (ts.isClassStaticBlockDeclaration(node)) {
		return { ...base, name: 'static', kind: vscode.SymbolKind.Method, languageKind: 'static-block', body: node.body };
	}
	if (ts.isCallSignatureDeclaration(node) || ts.isConstructSignatureDeclaration(node) || ts.isIndexSignatureDeclaration(node)) {
		const name = ts.isCallSignatureDeclaration(node) ? '(call)' : ts.isConstructSignatureDeclaration(node) ? '(new)' : '[index]';
		return { ...base, name, kind: ts.isConstructSignatureDeclaration(node) ? vscode.SymbolKind.Constructor : vscode.SymbolKind.Method, languageKind: ts.isCallSignatureDeclaration(node) ? 'call-signature' : ts.isConstructSignatureDeclaration(node) ? 'construct-signature' : 'index-signature' };
	}
	return undefined;
}

function structuralChildren(node: ts.Node): readonly ts.Node[] {
	if (ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
		return node.members;
	}
	return [];
}

function bodySpans(body: ts.Node | undefined, file: ts.SourceFile): readonly Span[] {
	if (body === undefined) {
		return [];
	}
	if (ts.isBlock(body) || ts.isModuleBlock(body)) {
		return [{ start: body.getStart(file) + 1, end: Math.max(body.getStart(file) + 1, body.getEnd() - 1) }];
	}
	return [nodeSpan(body, file)];
}

function entityKey(entity: Entity): string {
	return JSON.stringify([entity.value.kind, entity.value.languageKind, entity.value.name]);
}

function groupEntities(entities: readonly Entity[]): Map<string, Entity[]> {
	const groups = new Map<string, Entity[]>();
	for (const entity of entities) {
		const key = entityKey(entity);
		const group = groups.get(key);
		if (group === undefined) {
			groups.set(key, [entity]);
		} else {
			group.push(entity);
		}
	}
	return groups;
}

function classify(tree: DiffTree, side: Side, source: Source, textChangeIndex: number, span: Span, checkCancellation: () => void): void {
	checkCancellation();
	const entity = tree[side];
	if (entity === undefined || span.start >= span.end) {
		return;
	}
	const counterpart = side === 'original' ? tree.modified : tree.original;
	if (entity !== source.root && counterpart === undefined && contains(span, entity.span)) {
		addCoverage(tree, side, source, textChangeIndex, span, vscode.StructuralDiffClassification.Declaration);
		return;
	}
	let cursor = span.start;
	const children = tree.children.filter(child => child[side] !== undefined)
		.sort((left, right) => left[side]!.span.start - right[side]!.span.start);
	for (const child of children) {
		const childSpan = child[side]!.span;
		const start = Math.max(cursor, childSpan.start);
		const end = Math.min(span.end, childSpan.end);
		if (start >= end) {
			continue;
		}
		addCoverage(tree, side, source, textChangeIndex, { start: cursor, end: start });
		classify(child, side, source, textChangeIndex, { start, end }, checkCancellation);
		cursor = end;
	}
	addCoverage(tree, side, source, textChangeIndex, { start: cursor, end: span.end });
}

function addCoverage(tree: DiffTree, side: Side, source: Source, textChangeIndex: number, span: Span, classification?: vscode.StructuralDiffClassification): void {
	if (span.start >= span.end) {
		return;
	}
	const entity = tree[side]!;
	const header = { start: entity.span.start, end: entity.headerEnd };
	const boundaries = new Set([span.start, span.end]);
	for (const region of [...source.dependencies, header, ...entity.implementation, ...source.tests]) {
		if (region.start > span.start && region.start < span.end) {
			boundaries.add(region.start);
		}
		if (region.end > span.start && region.end < span.end) {
			boundaries.add(region.end);
		}
	}
	const offsets = [...boundaries].sort((left, right) => left - right);
	const changes = side === 'original' ? tree.result.originalChanges : tree.result.modifiedChanges;
	for (let index = 0; index < offsets.length - 1; index++) {
		const part = { start: offsets[index], end: offsets[index + 1] };
		const kind = classification
			?? (source.dependencies.some(region => contains(region, part)) ? vscode.StructuralDiffClassification.Dependency
				: contains(header, part) ? vscode.StructuralDiffClassification.Header
					: entity.implementation.some(region => contains(region, part)) ? vscode.StructuralDiffClassification.Implementation
						: vscode.StructuralDiffClassification.Other);
		const isTest = entity.isTest || source.tests.some(region => contains(region, part));
		const range = toRange(source.file, part);
		const previous = changes[changes.length - 1];
		if (previous?.textChangeIndex === textChangeIndex && previous.classification === kind
			&& (previous.tags?.includes(vscode.StructuralDiffTag.Test) ?? false) === isTest && previous.range.end.isEqual(range.start)) {
			changes[changes.length - 1] = { ...previous, range: new vscode.Range(previous.range.start, range.end) };
		} else {
			changes.push({ textChangeIndex, range, classification: kind, tags: isTest ? [vscode.StructuralDiffTag.Test] : [] });
		}
	}
}

function nodeSpan(node: ts.Node, file: ts.SourceFile): Span {
	return { start: node.getStart(file), end: node.getEnd() };
}

function fromRange(file: ts.SourceFile, range: vscode.Range): Span {
	return {
		start: file.getPositionOfLineAndCharacter(range.start.line, range.start.character),
		end: file.getPositionOfLineAndCharacter(range.end.line, range.end.character),
	};
}

function toRange(file: ts.SourceFile, span: Span): vscode.Range {
	const start = file.getLineAndCharacterOfPosition(span.start);
	const end = file.getLineAndCharacterOfPosition(span.end);
	return new vscode.Range(start.line, start.character, end.line, end.character);
}

function contains(container: Span, contained: Span): boolean {
	return container.start <= contained.start && container.end >= contained.end;
}

function isTestCallee(node: ts.Node): boolean {
	if (ts.isIdentifier(node)) {
		return node.text === 'test' || node.text === 'it' || node.text === 'describe' || node.text === 'suite';
	}
	if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
		return isTestCallee(node.expression);
	}
	return false;
}

function isTestFile(fileName: string): boolean {
	const normalized = fileName.replace(/\\/g, '/');
	const name = normalized.slice(normalized.lastIndexOf('/') + 1);
	return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/i.test(normalized)
		|| /(?:^|[._-])(?:test|spec)(?=\.[^.]+$)/i.test(name)
		|| /^(?:test|spec)[._-]/i.test(name);
}
