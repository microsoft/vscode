/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { DocumentIdentifier, Snapshot } from '@typescript/native/unstable/async';
import * as ts from '@typescript/native/unstable/ast';
import type * as vscode from 'vscode';

import type { ILogService } from '../../../../platform/log/common/logService';
import type { ICodeReviewService, TypeScriptChangeClassificationInput, TypeScriptChangeClassificationResult, TypeScriptMetricsResult } from '../../../../platform/languageContextProvider/common/codeReviewService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import type * as protocol from '../../common/serverProtocol';
import { toTypeScriptChangeClassificationResult, toTypeScriptMetricsResult } from '../codeReview';
import { computeTypeScriptMetrics } from './codeMetrics';
import { TypeScript7Api } from './ts7Api';

type Node = ts.Node;
type SourceFile = ts.SourceFile;

interface CodeReviewApi {
	clearSourceFileCache(): void;
	updateSnapshot(params?: { openFiles?: DocumentIdentifier[]; closeFiles?: DocumentIdentifier[] }): Promise<Snapshot>;
	runWithTemporaryFileUpdate(baseSnapshot: Snapshot, file: DocumentIdentifier, newText: string, callback: (snapshot: Snapshot) => void | Promise<void>): Promise<void>;
}

interface CodeReviewApiProvider extends vscode.Disposable {
	getApi(): Promise<CodeReviewApi | undefined>;
}

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

interface BucketInfoBase {
	readonly span: LineSpan;
	readonly order: number;
}

type BucketInfo = AddedOrChangedBucketInfo | DeletedBucketInfo;

interface AddedOrChangedBucketInfo extends BucketInfoBase {
	readonly changeType: 'added' | 'changed';
	readonly range: protocol.LineRange;
}

interface DeletedBucketInfo extends BucketInfoBase {
	readonly changeType: 'deleted';
	readonly deleted: protocol.TypeScriptDeletedLines;
}

interface ClassifiedBucket {
	readonly bucket: BucketInfo;
	readonly entity: StructuralEntity;
	readonly classifications: protocol.TypeScriptChangeClassification[];
}

export class TS7CodeReviewProvider implements Omit<ICodeReviewService, '_serviceBrand'>, vscode.Disposable {
	private readonly disposables = new DisposableStore();
	private readonly nativeApi: CodeReviewApiProvider;

	constructor(logService: ILogService, nativeApi: CodeReviewApiProvider = new TypeScript7Api(logService)) {
		this.nativeApi = this.disposables.add(nativeApi);
	}

	async computeMetrics(filePath: string, content?: string): Promise<TypeScriptMetricsResult | undefined> {
		const api = await this.nativeApi.getApi();
		if (api === undefined) {
			return undefined;
		}

		api.clearSourceFileCache();
		const snapshot = await api.updateSnapshot({ openFiles: [filePath] });
		try {
			if (content === undefined) {
				return await this.computeMetricsSnapshot(snapshot, filePath);
			}

			let result: TypeScriptMetricsResult | undefined;
			await api.runWithTemporaryFileUpdate(snapshot, filePath, content, async updatedSnapshot => {
				result = await this.computeMetricsSnapshot(updatedSnapshot, filePath);
			});
			return result;
		} finally {
			await snapshot.dispose();
			const closedSnapshot = await api.updateSnapshot({ closeFiles: [filePath] });
			await closedSnapshot.dispose();
		}
	}

	async classifyChanges(filePath: string, changes: TypeScriptChangeClassificationInput, content?: string): Promise<TypeScriptChangeClassificationResult | undefined> {
		const api = await this.nativeApi.getApi();
		if (api === undefined) {
			return undefined;
		}

		api.clearSourceFileCache();
		const snapshot = await api.updateSnapshot({ openFiles: [filePath] });
		try {
			let result: protocol.TypeScriptChangeClassificationResult | undefined;
			if (content === undefined) {
				result = await this.classifySnapshot(snapshot, filePath, changes);
			} else {
				await api.runWithTemporaryFileUpdate(snapshot, filePath, content, async updatedSnapshot => {
					result = await this.classifySnapshot(updatedSnapshot, filePath, changes);
				});
			}
			return result === undefined ? undefined : toTypeScriptChangeClassificationResult(result);
		} finally {
			await snapshot.dispose();
			const closedSnapshot = await api.updateSnapshot({ closeFiles: [filePath] });
			await closedSnapshot.dispose();
		}
	}

	dispose(): void {
		this.disposables.dispose();
	}

	private async computeMetricsSnapshot(snapshot: Snapshot, filePath: string): Promise<TypeScriptMetricsResult | undefined> {
		const project = await snapshot.getDefaultProjectForFile(filePath);
		const sourceFile = await project?.program.getSourceFile(filePath);
		return sourceFile === undefined ? undefined : toTypeScriptMetricsResult(computeTypeScriptMetrics(sourceFile));
	}

	private async classifySnapshot(snapshot: Snapshot, filePath: string, changes: TypeScriptChangeClassificationInput): Promise<protocol.TypeScriptChangeClassificationResult | undefined> {
		const project = await snapshot.getDefaultProjectForFile(filePath);
		const sourceFile = await project?.program.getSourceFile(filePath);
		return sourceFile === undefined ? undefined : new TypeScriptChangeClassifier().classify(sourceFile, changes);
	}
}

class TypeScriptChangeClassifier {
	classify(sourceFile: SourceFile, changes: protocol.TypeScriptChangeClassificationInput): protocol.TypeScriptChangeClassificationResult {
		const entities = this.collectEntities(sourceFile);
		const buckets = this.collectBuckets(changes);
		const classified = buckets
			.map(bucket => this.classifyBucket(bucket, entities))
			.sort((left, right) => left.bucket.span.start - right.bucket.span.start || left.bucket.order - right.bucket.order);
		return {
			buckets: this.groupByPath(classified),
		};
	}

	private groupByPath(classified: readonly ClassifiedBucket[]): protocol.TypeScriptChangeBucket[] {
		const result = new Map<string, protocol.TypeScriptChangeBucket>();
		for (const { bucket, entity, classifications } of classified) {
			const key = JSON.stringify(entity.path);
			let target = result.get(key);
			if (target === undefined) {
				target = { kind: entity.kind, path: entity.path.slice(), range: entity.range, changes: [] };
				result.set(key, target);
			}
			target.changes.push(bucket.changeType === 'deleted'
				? {
					classifications,
					changeType: bucket.changeType,
					line: bucket.deleted.line,
					deletedLineCount: bucket.deleted.deletedLineCount,
				}
				: {
					classifications,
					changeType: bucket.changeType,
					start: bucket.range.start,
					end: bucket.range.end,
				});
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

	private collectBuckets(changes: protocol.TypeScriptChangeClassificationInput): BucketInfo[] {
		let order = 0;
		return [
			...changes.added.map(range => ({
				changeType: 'added' as const,
				span: { start: range.start, end: range.end },
				range,
				order: order++,
			})),
			...changes.changed.map(range => ({
				changeType: 'changed' as const,
				span: { start: range.start, end: range.end },
				range,
				order: order++,
			})),
			...changes.deleted.map(deleted => ({
				changeType: 'deleted' as const,
				span: { start: deleted.line, end: deleted.line + 1 },
				deleted,
				order: order++,
			})),
		];
	}

	private classifyBucket(bucket: BucketInfo, entities: readonly StructuralEntity[]): ClassifiedBucket {
		const containing = entities
			.filter(entity => this.contains(entity.range, bucket.span))
			.sort((left, right) => right.depth - left.depth);
		let entity = containing[0] ?? entities[0];
		let isCompleteEntity = false;

		if (bucket.changeType !== 'deleted') {
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
		}

		const classifications: protocol.TypeScriptChangeClassification[] = [];
		if (isCompleteEntity && bucket.changeType === 'added') {
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
		if (ts.isMethodDeclaration(node) || ts.isMethodSignatureDeclaration(node)) {
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
		if (ts.isPropertyDeclaration(node) || ts.isPropertySignatureDeclaration(node) || ts.isPropertyAssignment(node)) {
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
		while (ts.isOuterExpression(current.parent) && current.parent.expression === current) {
			current = current.parent;
		}
		return current;
	}
}
