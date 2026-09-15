/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';

import type * as protocol from './protocol';
import TS from './typescript';
const ts = TS();

type Node = tt.Node;
type SourceFile = tt.SourceFile;
type OuterExpression = tt.ParenthesizedExpression | tt.AsExpression | tt.SatisfiesExpression | tt.TypeAssertion | tt.NonNullExpression;

interface LineSpan {
	readonly start: number;
	readonly end: number;
}

interface EntityInfo {
	readonly kind: string;
	readonly pathSegment?: string;
	readonly body?: Node;
	readonly containsEntities: boolean;
}

interface StructuralEntity {
	readonly kind: string;
	readonly path: readonly string[];
	readonly range: LineSpan;
	readonly structuralRange: LineSpan;
	readonly bodyRange: LineSpan | undefined;
	readonly depth: number;
}

interface BucketInfo {
	readonly changeType: 'added' | 'changed' | 'deleted';
	readonly span: LineSpan;
	readonly range: protocol.LineRange;
	readonly order: number;
}

interface ModifiedBucketInfo extends BucketInfo {
	readonly changeType: 'added' | 'changed';
}

interface OriginalBucketInfo extends BucketInfo {
	readonly changeType: 'deleted';
}

interface ClassifiedBucket<T extends BucketInfo> {
	readonly bucket: T;
	readonly entity: StructuralEntity;
	readonly classifications: protocol.TypeScriptChangeClassification[];
}

export class TypeScriptChangeClassifier {
	classifyModified(sourceFile: SourceFile, changes: protocol.TypeScriptModifiedChangeInput): protocol.TypeScriptModifiedChangeBucket[] {
		const entities = this.collectEntities(sourceFile);
		let order = 0;
		const buckets: ModifiedBucketInfo[] = [
			...changes.added.map(range => ({
				changeType: 'added' as const,
				span: range,
				range,
				order: order++,
			})),
			...changes.changed.map(range => ({
				changeType: 'changed' as const,
				span: range,
				range,
				order: order++,
			})),
		];
		const classified = buckets
			.map(bucket => this.classifyBucket(bucket, entities))
			.sort((left, right) => left.bucket.span.start - right.bucket.span.start || left.bucket.order - right.bucket.order);
		return this.groupModifiedByPath(classified);
	}

	classifyOriginal(sourceFile: SourceFile, deleted: readonly protocol.LineRange[]): protocol.TypeScriptOriginalChangeBucket[] {
		const entities = this.collectEntities(sourceFile);
		const buckets: OriginalBucketInfo[] = deleted.map((range, order) => ({
			changeType: 'deleted',
			span: range,
			range,
			order,
		}));
		const classified = buckets
			.map(bucket => this.classifyBucket(bucket, entities))
			.sort((left, right) => left.bucket.span.start - right.bucket.span.start || left.bucket.order - right.bucket.order);
		return this.groupOriginalByPath(classified);
	}

	private groupModifiedByPath(classified: readonly ClassifiedBucket<ModifiedBucketInfo>[]): protocol.TypeScriptModifiedChangeBucket[] {
		const result = new Map<string, protocol.TypeScriptModifiedChangeBucket>();
		for (const { bucket, entity, classifications } of classified) {
			const key = JSON.stringify(entity.path);
			let target = result.get(key);
			if (target === undefined) {
				target = { kind: entity.kind, path: entity.path.slice(), range: entity.range, changes: [] };
				result.set(key, target);
			}
			target.changes.push({ classifications, changeType: bucket.changeType, range: bucket.range });
		}
		return Array.from(result.values());
	}

	private groupOriginalByPath(classified: readonly ClassifiedBucket<OriginalBucketInfo>[]): protocol.TypeScriptOriginalChangeBucket[] {
		const result = new Map<string, protocol.TypeScriptOriginalChangeBucket>();
		for (const { bucket, entity, classifications } of classified) {
			const key = JSON.stringify(entity.path);
			let target = result.get(key);
			if (target === undefined) {
				target = { kind: entity.kind, path: entity.path.slice(), range: entity.range, changes: [] };
				result.set(key, target);
			}
			target.changes.push({ classifications, changeType: bucket.changeType, range: bucket.range });
		}
		return Array.from(result.values());
	}

	private collectEntities(sourceFile: SourceFile): readonly StructuralEntity[] {
		const sourceEntity: StructuralEntity = {
			kind: 'sourceFile',
			path: [],
			range: { start: 0, end: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1 },
			structuralRange: { start: 0, end: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1 },
			bodyRange: undefined,
			depth: 0,
		};
		const entities: StructuralEntity[] = [sourceEntity];
		sourceFile.forEachChild(child => this.collectEntity(child, sourceFile, [], sourceEntity, entities));
		return entities;
	}

	private collectEntity(node: Node, sourceFile: SourceFile, parentPath: readonly string[], parent: StructuralEntity, result: StructuralEntity[]): void {
		const info = ChangeAst.getEntity(node, sourceFile);
		let childPath = parentPath;
		let childParent = parent;
		if (info?.pathSegment !== undefined) {
			const path = [...parentPath, info.pathSegment];
			const entity = ChangeAst.createStructuralEntity(node, sourceFile, info, path, parent);
			result.push(entity);
			if (info.containsEntities) {
				childPath = path;
				childParent = entity;
			}
		} else {
			const container = ChangeAst.getNamedContainer(node, sourceFile);
			if (container !== undefined) {
				childPath = [...parentPath, container];
			}
		}
		node.forEachChild(child => this.collectEntity(child, sourceFile, childPath, childParent, result));
	}

	private classifyBucket<T extends BucketInfo>(bucket: T, entities: readonly StructuralEntity[]): ClassifiedBucket<T> {
		const containing = entities
			.filter(entity => this.contains(entity.range, bucket.span))
			.sort((left, right) => right.depth - left.depth);
		let entity = containing[0] ?? entities[0];
		let isCompleteEntity = false;

		const complete = entities
			.filter(candidate => candidate.kind !== 'sourceFile' && this.contains(bucket.span, candidate.range))
			.filter(candidate => !entities.some(parent =>
				parent !== candidate
				&& parent.kind !== 'sourceFile'
				&& this.contains(bucket.span, parent.range)
				&& this.contains(parent.range, candidate.range)));
		if (complete.length === 1) {
			entity = complete[0];
			isCompleteEntity = true;
		}

		const classifications: protocol.TypeScriptChangeClassification[] = [];
		if (isCompleteEntity && bucket.changeType !== 'changed') {
			classifications.push('structural');
		} else {
			if (this.intersects(entity.structuralRange, bucket.span)) {
				classifications.push('structural');
			}
			if (entity.bodyRange !== undefined && this.intersects(entity.bodyRange, bucket.span)) {
				classifications.push('algorithmic');
			}
		}
		if (classifications.length === 0) {
			classifications.push(entity.bodyRange === undefined ? 'structural' : 'algorithmic');
		}
		return { bucket, entity, classifications };
	}

	private contains(container: LineSpan, contained: LineSpan): boolean {
		return container.start <= contained.start && container.end >= contained.end;
	}

	private intersects(left: LineSpan, right: LineSpan): boolean {
		return left.start < right.end && right.start < left.end;
	}
}

namespace ChangeAst {
	export function getEntity(node: Node, sourceFile: SourceFile): EntityInfo | undefined {
		if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
			const pathSegment = node.name?.getText(sourceFile) ?? (ts.isClassExpression(node) ? getAssignedEntityName(node, sourceFile) : undefined);
			return pathSegment === undefined ? undefined : { kind: 'class', pathSegment, containsEntities: true };
		}
		if (ts.isInterfaceDeclaration(node)) {
			return { kind: 'interface', pathSegment: node.name.getText(sourceFile), containsEntities: true };
		}
		if (ts.isModuleDeclaration(node)) {
			return { kind: 'module', pathSegment: node.name.text, containsEntities: true };
		}
		if (ts.isEnumDeclaration(node)) {
			return { kind: 'enum', pathSegment: node.name.getText(sourceFile), containsEntities: true };
		}
		if (ts.isTypeAliasDeclaration(node)) {
			return { kind: 'type-alias', pathSegment: node.name.getText(sourceFile), containsEntities: false };
		}
		if (ts.isFunctionDeclaration(node)) {
			return {
				kind: 'function',
				pathSegment: node.name?.getText(sourceFile),
				body: node.body,
				containsEntities: true,
			};
		}
		if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
			return {
				kind: ts.isArrowFunction(node) ? 'arrow-function' : 'function',
				pathSegment: ts.isFunctionExpression(node) ? node.name?.getText(sourceFile) ?? getAssignedEntityName(node, sourceFile) : getAssignedEntityName(node, sourceFile),
				body: node.body,
				containsEntities: true,
			};
		}
		if (ts.isConstructorDeclaration(node)) {
			return { kind: 'constructor', pathSegment: 'constructor', body: node.body, containsEntities: true };
		}
		if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
			return {
				kind: 'method',
				pathSegment: node.name.getText(sourceFile),
				body: ts.isMethodDeclaration(node) ? node.body : undefined,
				containsEntities: true,
			};
		}
		if (ts.isGetAccessorDeclaration(node)) {
			return { kind: 'getter', pathSegment: `get ${node.name.getText(sourceFile)}`, body: node.body, containsEntities: true };
		}
		if (ts.isSetAccessorDeclaration(node)) {
			return { kind: 'setter', pathSegment: `set ${node.name.getText(sourceFile)}`, body: node.body, containsEntities: true };
		}
		if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isPropertyAssignment(node)) {
			return { kind: 'property', pathSegment: node.name.getText(sourceFile), containsEntities: false };
		}
		if (ts.isEnumMember(node)) {
			return { kind: 'enum-member', pathSegment: node.name.getText(sourceFile), containsEntities: false };
		}
		return undefined;
	}

	export function getNamedContainer(node: Node, sourceFile: SourceFile): string | undefined {
		return ts.isObjectLiteralExpression(node) ? getAssignedEntityName(node, sourceFile) : undefined;
	}

	export function createStructuralEntity(node: Node, sourceFile: SourceFile, info: EntityInfo, path: readonly string[], parent: StructuralEntity): StructuralEntity {
		const range = getLineSpan(node, sourceFile);
		const structuralChildren = getStructuralChildren(node, info);
		const structuralEnd = structuralChildren[0] === undefined
			? range.end
			: sourceFile.getLineAndCharacterOfPosition(structuralChildren[0].getStart(sourceFile)).line + 1;
		return {
			kind: info.kind,
			path,
			range,
			structuralRange: { start: range.start, end: structuralEnd },
			bodyRange: info.body === undefined ? undefined : getBodyLineSpan(info.body, sourceFile),
			depth: parent.depth + 1,
		};
	}

	function getStructuralChildren(node: Node, info: EntityInfo): readonly Node[] {
		if (info.body !== undefined) {
			return [info.body];
		}
		if (ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
			return node.members;
		}
		if (ts.isModuleDeclaration(node) && node.body !== undefined) {
			return [node.body];
		}
		return [];
	}

	function getBodyLineSpan(body: Node, sourceFile: SourceFile): LineSpan | undefined {
		if (!ts.isBlock(body)) {
			return getLineSpan(body, sourceFile);
		}
		const firstStatement = body.statements[0];
		const lastStatement = body.statements[body.statements.length - 1];
		return firstStatement === undefined || lastStatement === undefined
			? undefined
			: {
				start: sourceFile.getLineAndCharacterOfPosition(firstStatement.getStart(sourceFile)).line,
				end: sourceFile.getLineAndCharacterOfPosition(lastStatement.getEnd()).line + 1,
			};
	}

	function getLineSpan(node: Node, sourceFile: SourceFile): LineSpan {
		return {
			start: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line,
			end: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
		};
	}

	function getAssignedEntityName(node: Node, sourceFile: SourceFile): string | undefined {
		const outerExpression = getOutermostExpression(node);
		const parent = outerExpression.parent;
		if (!((ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.initializer === outerExpression)) {
			return undefined;
		}
		if (ts.isVariableDeclaration(parent) && !ts.isIdentifier(parent.name)) {
			return undefined;
		}
		return parent.name.getText(sourceFile);
	}

	function getOutermostExpression(node: Node): Node {
		let current = node;
		while (isOuterExpression(current.parent) && current.parent.expression === current) {
			current = current.parent;
		}
		return current;
	}

	function isOuterExpression(node: Node): node is OuterExpression {
		return ts.isParenthesizedExpression(node)
			|| ts.isAsExpression(node)
			|| ts.isSatisfiesExpression(node)
			|| ts.isTypeAssertionExpression(node)
			|| ts.isNonNullExpression(node);
	}
}
