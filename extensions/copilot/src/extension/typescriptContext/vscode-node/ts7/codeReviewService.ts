/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { DocumentIdentifier, Snapshot } from '@typescript/native/unstable/async';
import * as ts from '@typescript/native/unstable/ast';
import type * as vscode from 'vscode';

import type { ILogService } from '../../../../platform/log/common/logService';
import type { TypeScriptChangeClassificationInput, TypeScriptChangeClassificationResult, TypeScriptMetricsResult } from '../../../../platform/languageContextProvider/common/codeReviewService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import * as protocol from '../../common/serverProtocol';
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

interface NamedContainer {
	readonly kind: string;
	readonly pathSegment: string;
}

interface StructuralEntity {
	readonly kind: string;
	readonly path: readonly string[];
	readonly pathKinds: readonly string[];
	readonly range: LineSpan;
	readonly signatureRange: LineSpan | undefined;
	readonly statementRanges: readonly LineSpan[];
	readonly depth: number;
}

interface ClassificationContext {
	readonly importRanges: readonly LineSpan[];
	readonly testRanges: readonly LineSpan[];
	readonly isTestFile: boolean;
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
	readonly classifications: protocol.TypeScriptChangeClassificationCoverage[];
}

export class TS7CodeReviewProvider implements vscode.Disposable {
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

	async classifyChanges(input: TypeScriptChangeClassificationInput): Promise<TypeScriptChangeClassificationResult | undefined> {
		const api = await this.nativeApi.getApi();
		if (api === undefined) {
			return undefined;
		}

		const { filePath, modified, original } = input;
		api.clearSourceFileCache();
		const snapshot = await api.updateSnapshot({ openFiles: [filePath] });
		try {
			let modifiedResult: protocol.TypeScriptModifiedChangeBucket[] | undefined;
			if (modified.content === undefined) {
				modifiedResult = await this.classifyModifiedSnapshot(snapshot, filePath, modified);
			} else {
				await api.runWithTemporaryFileUpdate(snapshot, filePath, modified.content, async updatedSnapshot => {
					modifiedResult = await this.classifyModifiedSnapshot(updatedSnapshot, filePath, modified);
				});
			}

			let originalResult: protocol.TypeScriptOriginalChangeBucket[] | undefined;
			await api.runWithTemporaryFileUpdate(snapshot, filePath, original.content, async updatedSnapshot => {
				originalResult = await this.classifyOriginalSnapshot(updatedSnapshot, filePath, original.deleted);
			});
			return modifiedResult === undefined || originalResult === undefined
				? undefined
				: toTypeScriptChangeClassificationResult({ modified: modifiedResult, original: originalResult });
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

	private async classifyModifiedSnapshot(snapshot: Snapshot, filePath: string, changes: protocol.TypeScriptModifiedChangeInput): Promise<protocol.TypeScriptModifiedChangeBucket[] | undefined> {
		const project = await snapshot.getDefaultProjectForFile(filePath);
		const sourceFile = await project?.program.getSourceFile(filePath);
		return sourceFile === undefined ? undefined : new TypeScriptChangeClassifier().classifyModified(sourceFile, changes);
	}

	private async classifyOriginalSnapshot(snapshot: Snapshot, filePath: string, deleted: readonly protocol.LineRange[]): Promise<protocol.TypeScriptOriginalChangeBucket[] | undefined> {
		const project = await snapshot.getDefaultProjectForFile(filePath);
		const sourceFile = await project?.program.getSourceFile(filePath);
		return sourceFile === undefined ? undefined : new TypeScriptChangeClassifier().classifyOriginal(sourceFile, deleted);
	}
}

class TypeScriptChangeClassifier {
	classifyModified(sourceFile: SourceFile, changes: protocol.TypeScriptModifiedChangeInput): protocol.TypeScriptModifiedChangeBucket[] {
		const entities = this.collectEntities(sourceFile);
		const context = ChangeAst.createClassificationContext(sourceFile);
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
			.map(bucket => this.classifyBucket(bucket, entities, context))
			.sort((left, right) => left.bucket.span.start - right.bucket.span.start || left.bucket.order - right.bucket.order);
		return this.groupModifiedByPath(classified);
	}

	classifyOriginal(sourceFile: SourceFile, deleted: readonly protocol.LineRange[]): protocol.TypeScriptOriginalChangeBucket[] {
		const entities = this.collectEntities(sourceFile);
		const context = ChangeAst.createClassificationContext(sourceFile);
		const buckets: OriginalBucketInfo[] = deleted.map((range, order) => ({
			changeType: 'deleted',
			span: range,
			range,
			order,
		}));
		const classified = buckets
			.map(bucket => this.classifyBucket(bucket, entities, context))
			.sort((left, right) => left.bucket.span.start - right.bucket.span.start || left.bucket.order - right.bucket.order);
		return this.groupOriginalByPath(classified);
	}

	private groupModifiedByPath(classified: readonly ClassifiedBucket<ModifiedBucketInfo>[]): protocol.TypeScriptModifiedChangeBucket[] {
		const result = new Map<string, protocol.TypeScriptModifiedChangeBucket>();
		for (const { bucket, entity, classifications } of classified) {
			const key = JSON.stringify(entity.path);
			let target = result.get(key);
			if (target === undefined) {
				target = {
					kind: entity.kind,
					path: entity.path.slice(),
					pathKinds: entity.pathKinds.slice(),
					range: entity.range,
					changes: [],
				};
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
				target = {
					kind: entity.kind,
					path: entity.path.slice(),
					pathKinds: entity.pathKinds.slice(),
					range: entity.range,
					changes: [],
				};
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
			pathKinds: [],
			range: { start: 0, end: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1 },
			signatureRange: undefined,
			statementRanges: ChangeAst.getSourceStatementRanges(sourceFile),
			depth: 0,
		};
		const entities: StructuralEntity[] = [sourceEntity];
		sourceFile.forEachChild(child => this.collectEntity(child, sourceFile, [], [], sourceEntity, entities));
		return entities;
	}

	private collectEntity(node: Node, sourceFile: SourceFile, parentPath: readonly string[], parentPathKinds: readonly string[], parent: StructuralEntity, result: StructuralEntity[]): void {
		const info = ChangeAst.getEntity(node, sourceFile);
		let childPath = parentPath;
		let childPathKinds = parentPathKinds;
		let childParent = parent;
		if (info?.pathSegment !== undefined) {
			const path = [...parentPath, info.pathSegment];
			const pathKinds = [...parentPathKinds, info.kind];
			const entity = ChangeAst.createStructuralEntity(node, sourceFile, info, path, pathKinds, parent);
			result.push(entity);
			if (info.containsEntities) {
				childPath = path;
				childPathKinds = pathKinds;
				childParent = entity;
			}
		} else {
			const container = ChangeAst.getNamedContainer(node, sourceFile);
			if (container !== undefined) {
				childPath = [...parentPath, container.pathSegment];
				childPathKinds = [...parentPathKinds, container.kind];
			}
		}
		node.forEachChild(child => this.collectEntity(child, sourceFile, childPath, childPathKinds, childParent, result));
	}

	private classifyBucket<T extends BucketInfo>(bucket: T, entities: readonly StructuralEntity[], context: ClassificationContext): ClassifiedBucket<T> {
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

		if (isCompleteEntity && bucket.changeType !== 'changed') {
			return {
				bucket,
				entity,
				classifications: [this.createClassification(protocol.TypeScriptChangeClassification.Declaration, [bucket.span], entity, context)],
			};
		}

		const classifications: protocol.TypeScriptChangeClassificationCoverage[] = [];
		const importRanges = ClassificationRanges.intersect(bucket.span, context.importRanges);
		if (importRanges.length > 0) {
			classifications.push(this.createClassification(protocol.TypeScriptChangeClassification.Import, importRanges, entity, context));
		}
		const signatureRanges = entity.signatureRange === undefined
			? []
			: ClassificationRanges.intersect(bucket.span, [entity.signatureRange]);
		if (signatureRanges.length > 0) {
			classifications.push(this.createClassification(protocol.TypeScriptChangeClassification.Signature, signatureRanges, entity, context));
		}
		const statementRanges = ClassificationRanges.intersect(bucket.span, entity.statementRanges);
		if (statementRanges.length > 0) {
			classifications.push(this.createClassification(protocol.TypeScriptChangeClassification.Statement, statementRanges, entity, context));
		}
		const classifiedRanges = classifications.flatMap(classification => classification.ranges);
		const otherRanges = ClassificationRanges.subtract(bucket.span, classifiedRanges);
		if (otherRanges.length > 0) {
			classifications.push(this.createClassification(protocol.TypeScriptChangeClassification.Other, otherRanges, entity, context));
		}
		return { bucket, entity, classifications };
	}

	private createClassification(
		classification: protocol.TypeScriptChangeClassification,
		ranges: readonly LineSpan[],
		entity: StructuralEntity,
		context: ClassificationContext,
	): protocol.TypeScriptChangeClassificationCoverage {
		const isTest = context.isTestFile
			|| ChangeAst.isTestEntity(entity)
			|| ranges.some(range => context.testRanges.some(testRange => ClassificationRanges.intersects(range, testRange)));
		return {
			classification,
			ranges: ranges.map(range => ({ ...range })),
			tags: isTest ? ['test'] : [],
		};
	}

	private contains(container: LineSpan, contained: LineSpan): boolean {
		return container.start <= contained.start && container.end >= contained.end;
	}
}

namespace ClassificationRanges {
	export function intersect(change: LineSpan, regions: readonly LineSpan[]): LineSpan[] {
		return merge(regions
			.map(region => ({
				start: Math.max(change.start, region.start),
				end: Math.min(change.end, region.end),
			}))
			.filter(range => range.start < range.end));
	}

	export function subtract(change: LineSpan, covered: readonly LineSpan[]): LineSpan[] {
		const result: LineSpan[] = [];
		let start = change.start;
		for (const range of merge(covered)) {
			if (range.end <= start) {
				continue;
			}
			if (range.start > start) {
				result.push({ start, end: Math.min(range.start, change.end) });
			}
			start = Math.max(start, range.end);
			if (start >= change.end) {
				break;
			}
		}
		if (start < change.end) {
			result.push({ start, end: change.end });
		}
		return result.filter(range => range.start < range.end);
	}

	export function intersects(left: LineSpan, right: LineSpan): boolean {
		return left.start < right.end && right.start < left.end;
	}

	function merge(ranges: readonly LineSpan[]): LineSpan[] {
		const sorted = ranges
			.filter(range => range.start < range.end)
			.map(range => ({ ...range }))
			.sort((left, right) => left.start - right.start || left.end - right.end);
		const result: Array<{ start: number; end: number }> = [];
		for (const range of sorted) {
			const previous = result[result.length - 1];
			if (previous !== undefined && range.start <= previous.end) {
				previous.end = Math.max(previous.end, range.end);
			} else {
				result.push(range);
			}
		}
		return result;
	}
}

namespace ChangeAst {
	export function createClassificationContext(sourceFile: SourceFile): ClassificationContext {
		return {
			importRanges: getImportRanges(sourceFile),
			testRanges: getTestRanges(sourceFile),
			isTestFile: isTestFile(sourceFile.fileName),
		};
	}

	export function getSourceStatementRanges(sourceFile: SourceFile): readonly LineSpan[] {
		return getStatementRanges(sourceFile.statements, sourceFile);
	}

	export function isTestEntity(entity: StructuralEntity): boolean {
		return entity.path.some(segment => /^(?:it|test|spec)(?:$|[\s_.:-]|[A-Z])/.test(segment));
	}

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
		if (ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) {
			return {
				kind: 'property',
				pathSegment: node.name.getText(sourceFile),
				body: node.initializer,
				containsEntities: false,
			};
		}
		if (ts.isPropertySignatureDeclaration(node)) {
			return { kind: 'property', pathSegment: node.name.getText(sourceFile), containsEntities: false };
		}
		if (ts.isEnumMember(node)) {
			return { kind: 'enum-member', pathSegment: node.name.getText(sourceFile), containsEntities: false };
		}
		return undefined;
	}

	export function getNamedContainer(node: Node, sourceFile: SourceFile): NamedContainer | undefined {
		const pathSegment = ts.isObjectLiteralExpression(node) ? getAssignedEntityName(node, sourceFile) : undefined;
		return pathSegment === undefined ? undefined : { kind: 'object', pathSegment };
	}

	export function createStructuralEntity(node: Node, sourceFile: SourceFile, info: EntityInfo, path: readonly string[], pathKinds: readonly string[], parent: StructuralEntity): StructuralEntity {
		const range = getLineSpan(node, sourceFile);
		const structuralChildren = getStructuralChildren(node, info);
		const structuralEnd = structuralChildren[0] === undefined
			? range.end
			: sourceFile.getLineAndCharacterOfPosition(structuralChildren[0].getStart(sourceFile)).line + 1;
		return {
			kind: info.kind,
			path,
			pathKinds,
			range,
			signatureRange: { start: range.start, end: structuralEnd },
			statementRanges: info.body === undefined
				? getContainerStatementRanges(node, sourceFile)
				: [getBodyLineSpan(info.body, sourceFile)].filter((value): value is LineSpan => value !== undefined),
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

	function getImportRanges(sourceFile: SourceFile): readonly LineSpan[] {
		const result: LineSpan[] = [];
		const visit = (node: Node): void => {
			if (isImportLike(node)) {
				result.push(getLineSpan(node, sourceFile));
				return;
			}
			node.forEachChild(visit);
		};
		sourceFile.forEachChild(visit);
		return result;
	}

	function getContainerStatementRanges(node: Node, sourceFile: SourceFile): readonly LineSpan[] {
		if (ts.isModuleDeclaration(node) && node.body !== undefined && ts.isModuleBlock(node.body)) {
			return getStatementRanges(node.body.statements, sourceFile);
		}
		return [];
	}

	function getStatementRanges(statements: readonly Node[], sourceFile: SourceFile): readonly LineSpan[] {
		return statements
			.filter(statement => !isImportLike(statement) && getEntity(statement, sourceFile) === undefined)
			.map(statement => getLineSpan(statement, sourceFile));
	}

	function isImportLike(node: Node): boolean {
		return ts.isImportDeclaration(node)
			|| ts.isImportEqualsDeclaration(node)
			|| (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined);
	}

	function getTestRanges(sourceFile: SourceFile): readonly LineSpan[] {
		const result: LineSpan[] = [];
		const visit = (node: Node): void => {
			if (ts.isCallExpression(node) && isTestCallee(node.expression)) {
				for (const argument of node.arguments) {
					if (ts.isFunctionExpression(argument) || ts.isArrowFunction(argument)) {
						result.push(getLineSpan(argument, sourceFile));
					}
				}
			}
			node.forEachChild(visit);
		};
		sourceFile.forEachChild(visit);
		return result;
	}

	function isTestCallee(node: Node): boolean {
		if (ts.isIdentifier(node)) {
			return node.text === 'test' || node.text === 'it' || node.text === 'describe' || node.text === 'suite';
		}
		if (ts.isPropertyAccessExpression(node)) {
			return isTestCallee(node.expression);
		}
		return ts.isCallExpression(node) && isTestCallee(node.expression);
	}

	function isTestFile(fileName: string): boolean {
		const normalized = fileName.replace(/\\/g, '/');
		const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
		return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/i.test(normalized)
			|| /(?:^|[._-])(?:test|spec)(?=\.[^.]+$)/i.test(basename)
			|| /^(?:test|spec)[._-]/i.test(basename);
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
