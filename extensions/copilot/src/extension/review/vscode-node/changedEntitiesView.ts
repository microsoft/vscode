/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';

import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import type { Change, Repository } from '../../../platform/git/vscode/git';
import { ICodeReviewService, TypeScriptChangeClassification, type TypeScriptChangeBucket, type TypeScriptChangeToExplain, type TypeScriptClassifiedModifiedLines, type TypeScriptClassifiedOriginalLines, type TypeScriptMetrics, type TypeScriptMetricsResult } from '../../../platform/languageContextProvider/common/codeReviewService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable, DisposableStore, MutableDisposable } from '../../../util/vs/base/common/lifecycle';
import type { IExtensionContribution } from '../../common/contributions';
import { computeLineChangeRanges } from '../node/lineChangeRanges';

export const changedEntitiesViewId = 'github.copilot.changedEntities';

const openChangedEntityDiffCommand = 'github.copilot.openChangedEntityDiff';
const supportedExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const maxExplanationSnippetLength = 4000;

type ChangedEntitiesTreeElement = ChangesGroupItem | ChangedFileItem | ChangedEntityItem | MessageItem;
type ClassifiedChange = TypeScriptClassifiedModifiedLines | TypeScriptClassifiedOriginalLines;

export class ChangedEntitiesViewContribution extends Disposable implements IExtensionContribution {
	readonly id = 'changedEntitiesView';

	constructor(
		@IGitExtensionService gitExtensionService: IGitExtensionService,
		@ICodeReviewService codeReviewService: ICodeReviewService,
		@ILogService logService: ILogService,
	) {
		super();
		const provider = this._register(new ChangedEntitiesTreeDataProvider(gitExtensionService, codeReviewService, logService));
		this._register(vscode.window.createTreeView(changedEntitiesViewId, {
			treeDataProvider: provider,
			showCollapseAll: true,
		}));
		this._register(vscode.commands.registerCommand(openChangedEntityDiffCommand, async (uri: vscode.Uri) => {
			await codeReviewService.openDiff(uri);
		}));
	}
}

export class ChangedEntitiesTreeDataProvider extends Disposable implements vscode.TreeDataProvider<ChangedEntitiesTreeElement> {
	private readonly changeEmitter = this._register(new vscode.EventEmitter<ChangedEntitiesTreeElement | undefined>());
	private readonly repositoryDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly entityCache = new Map<string, Promise<ChangedEntitiesTreeElement[]>>();
	private resourceSignature: string | undefined;

	readonly onDidChangeTreeData = this.changeEmitter.event;

	constructor(
		@IGitExtensionService private readonly gitExtensionService: IGitExtensionService,
		@ICodeReviewService private readonly codeReviewService: ICodeReviewService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(this.gitExtensionService.onDidChange(() => this.bindGitApi()));
		this._register(vscode.workspace.onDidSaveTextDocument(document => {
			if (supportedExtensions.has(path.extname(document.uri.fsPath).toLowerCase())) {
				this.refresh(true);
			}
		}));
		this.bindGitApi();
	}

	getTreeItem(element: ChangedEntitiesTreeElement): vscode.TreeItem {
		return element.treeItem;
	}

	async resolveTreeItem(item: vscode.TreeItem, element: ChangedEntitiesTreeElement, token: vscode.CancellationToken): Promise<vscode.TreeItem> {
		if (!(element instanceof ChangedEntityItem) || !element.canExplain) {
			return item;
		}
		try {
			item.tooltip = await element.resolveTooltip(this.codeReviewService, token);
		} catch (error) {
			if (!token.isCancellationRequested) {
				this.logService.error(error instanceof Error ? error : String(error), 'Failed to generate TypeScript change explanations');
			}
			item.tooltip = element.fallbackTooltip;
		}
		return item;
	}

	async getChildren(element?: ChangedEntitiesTreeElement): Promise<ChangedEntitiesTreeElement[]> {
		if (element === undefined) {
			const files = this.getChangedFiles();
			return files.length === 0 ? [] : [new ChangesGroupItem(files)];
		}
		if (element instanceof ChangesGroupItem) {
			return [...element.files];
		}
		if (element instanceof ChangedFileItem) {
			let result = this.entityCache.get(element.id);
			if (result === undefined) {
				result = this.computeEntities(element);
				this.entityCache.set(element.id, result);
			}
			return result;
		}
		if (element instanceof ChangedEntityItem) {
			return [...element.children];
		}
		return [];
	}

	private bindGitApi(): void {
		const disposables = new DisposableStore();
		const api = this.gitExtensionService.getExtensionApi();
		if (api !== undefined) {
			disposables.add(api.onDidOpenRepository(() => this.bindGitApi()));
			disposables.add(api.onDidCloseRepository(() => this.bindGitApi()));
			for (const repository of api.repositories) {
				disposables.add(repository.state.onDidChange(() => this.refresh()));
			}
		}
		this.repositoryDisposables.value = disposables;
		this.refresh(true);
	}

	private refresh(force: boolean = false): void {
		const signature = this.getChangedFiles()
			.map(file => `${file.id}:${file.changes.map(change => change.status).sort().join(',')}`)
			.join('|');
		if (!force && signature === this.resourceSignature) {
			return;
		}
		this.resourceSignature = signature;
		this.entityCache.clear();
		this.changeEmitter.fire(undefined);
	}

	private getChangedFiles(): ChangedFileItem[] {
		const api = this.gitExtensionService.getExtensionApi();
		if (api === undefined) {
			return [];
		}

		const result = new Map<string, ChangedFileItem>();
		for (const repository of api.repositories) {
			const changes = [
				...repository.state.indexChanges,
				...repository.state.workingTreeChanges,
				...repository.state.untrackedChanges,
			].filter(change => change.status !== 8 /* Status.IGNORED */);
			for (const change of changes) {
				if (!supportedExtensions.has(path.extname(change.uri.fsPath).toLowerCase())) {
					continue;
				}
				const key = `${repository.rootUri.toString()}\0${change.uri.toString()}`;
				const existing = result.get(key);
				if (existing === undefined) {
					result.set(key, new ChangedFileItem(repository, change));
				} else {
					existing.changes.push(change);
				}
			}
		}
		return Array.from(result.values())
			.filter(file => !file.changes.some(change => isDeletedStatus(change.status)))
			.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
	}

	private async computeEntities(file: ChangedFileItem): Promise<ChangedEntitiesTreeElement[]> {
		try {
			const modified = (await vscode.workspace.openTextDocument(file.uri)).getText();
			const original = await this.getOriginalContent(file);
			const ranges = computeLineChangeRanges(original, modified);
			const result = await this.codeReviewService.classifyChanges({
				filePath: file.uri.fsPath,
				modified: {
					content: modified,
					added: ranges.added,
					changed: ranges.changed,
				},
				original: {
					content: original,
					deleted: ranges.deleted,
				},
			});
			if (result === undefined) {
				return [MessageItem.unavailable()];
			}

			const hasCodeChanges = result.modified.some(affectsCode) || result.original.some(affectsCode);
			const modifiedMetrics = hasCodeChanges
				? await this.codeReviewService.computeMetrics(file.uri.fsPath, modified)
				: undefined;
			const originalMetrics = hasCodeChanges
				? await this.codeReviewService.computeMetrics(file.uri.fsPath, original)
				: undefined;
			const entities = this.mergeBuckets(
				result.modified,
				result.original,
				indexMetrics(modifiedMetrics),
				indexMetrics(originalMetrics),
			);
			if (entities.length === 0) {
				return [MessageItem.empty()];
			}
			this.prepareExplanations(entities, original, modified, ranges.changed, ranges.originalChanged);

			const entityItems = createEntityTreeItems(file.id, file.uri.fsPath, entities);
			const fileComplexity = rollUpComplexity(undefined, entityItems);
			if (fileComplexity !== undefined && hasComplexityDelta(fileComplexity)) {
				file.setComplexityRollup(fileComplexity);
				this.changeEmitter.fire(file);
			}
			return entityItems;
		} catch (error) {
			this.logService.error(error, `Failed to classify changed entities for '${file.uri.fsPath}'`);
			return [MessageItem.error()];
		}
	}

	private async getOriginalContent(file: ChangedFileItem): Promise<string> {
		const originalUri = file.changes.find(change => change.originalUri)?.originalUri ?? file.uri;
		try {
			return await file.repository.show('HEAD', originalUri.fsPath);
		} catch (error) {
			if (file.changes.some(change => isAddedStatus(change.status))) {
				return '';
			}
			throw error;
		}
	}

	private mergeBuckets(
		modified: readonly TypeScriptChangeBucket[],
		original: readonly TypeScriptChangeBucket[],
		modifiedMetrics: ReadonlyMap<string, TypeScriptMetrics>,
		originalMetrics: ReadonlyMap<string, TypeScriptMetrics>,
	): EntityViewModel[] {
		const result = new Map<string, EntityViewModel>();
		const addBucket = (bucket: TypeScriptChangeBucket): void => {
			const key = getPathKey(bucket.path);
			const existing = result.get(key);
			if (existing === undefined) {
				result.set(key, {
					kind: bucket.kind,
					path: bucket.path,
					pathKinds: bucket.pathKinds,
					rangeStart: bucket.range.start,
					entityLink: bucket.entityLink,
					changes: [...bucket.changes],
					metrics: undefined,
					explanationRequests: [],
				});
			} else {
				existing.entityLink ??= bucket.entityLink;
				existing.changes.push(...bucket.changes);
			}
		};
		for (const bucket of modified) {
			addBucket(bucket);
		}
		for (const bucket of original) {
			addBucket(bucket);
		}
		for (const [key, entity] of result) {
			if (changesAffectCode(entity.changes)) {
				entity.metrics = computeChangeMetrics(
					modifiedMetrics.get(key),
					originalMetrics.get(key),
					changesAffectStatements(entity.changes),
				);
			}
		}
		return Array.from(result.values()).sort((left, right) => left.rangeStart - right.rangeStart);
	}

	private prepareExplanations(
		entities: readonly EntityViewModel[],
		original: string,
		modified: string,
		changed: readonly { start: number; end: number }[],
		originalChanged: readonly { start: number; end: number }[],
	): void {
		const originalChangedByModifiedRange = new Map(changed.map((range, index) => [getRangeKey(range), originalChanged[index]]));
		let changeIndex = 0;
		for (const entity of entities) {
			for (const change of entity.changes) {
				const id = `change-${changeIndex++}`;
				const originalRange = change.changeType === 'deleted'
					? change.range
					: change.changeType === 'changed'
						? originalChangedByModifiedRange.get(getRangeKey(change.range))
						: undefined;
				const modifiedRange = change.changeType === 'deleted' ? undefined : change.range;
				entity.explanationRequests.push({
					change,
					request: {
						id,
						kind: entity.kind,
						path: entity.path,
						changeType: change.changeType,
						classifications: change.classifications,
						original: originalRange === undefined ? undefined : getLines(original, originalRange),
						modified: modifiedRange === undefined ? undefined : getLines(modified, modifiedRange),
					},
				});
			}
		}
	}
}

class ChangesGroupItem {
	readonly treeItem: vscode.TreeItem;

	constructor(readonly files: readonly ChangedFileItem[]) {
		this.treeItem = new vscode.TreeItem(l10n.t`Changes`, vscode.TreeItemCollapsibleState.Expanded);
		this.treeItem.id = `${changedEntitiesViewId}.changes`;
		this.treeItem.contextValue = 'copilotChangedEntitiesGroup';
		this.treeItem.accessibilityInformation = {
			label: l10n.t`Changed entities, ${files.length} files`,
		};
	}
}

class ChangedFileItem {
	readonly id: string;
	readonly relativePath: string;
	readonly treeItem: vscode.TreeItem;
	readonly changes: Change[];
	private readonly directory: string | undefined;

	constructor(readonly repository: Repository, change: Change) {
		this.uri = change.uri;
		this.changes = [change];
		this.id = `${repository.rootUri.toString()}:${this.uri.toString()}`;
		this.relativePath = path.relative(repository.rootUri.fsPath, this.uri.fsPath);

		this.treeItem = new vscode.TreeItem(path.basename(this.uri.fsPath), vscode.TreeItemCollapsibleState.Collapsed);
		this.treeItem.id = `${changedEntitiesViewId}.file.${this.id}`;
		this.treeItem.resourceUri = this.uri;
		this.treeItem.iconPath = vscode.ThemeIcon.File;
		const directory = path.dirname(this.relativePath);
		this.directory = directory === '.' ? undefined : directory;
		this.treeItem.description = this.directory;
		this.treeItem.contextValue = 'copilotChangedEntitiesFile';
		this.treeItem.accessibilityInformation = {
			label: l10n.t`Changed file ${this.relativePath}`,
		};
	}

	readonly uri: vscode.Uri;

	setComplexityRollup(complexity: ComplexityDelta): void {
		const metricsDescription = formatMetrics(complexity, undefined);
		const accessibleMetricsDescription = formatAccessibleMetrics(complexity, undefined);
		if (metricsDescription === undefined || accessibleMetricsDescription === undefined) {
			return;
		}
		this.treeItem.description = this.directory === undefined
			? metricsDescription
			: l10n.t`${this.directory} — ${metricsDescription}`;
		this.treeItem.tooltip = l10n.t`${this.relativePath} — ${metricsDescription}`;
		this.treeItem.accessibilityInformation = {
			label: l10n.t`Changed file ${this.relativePath}, ${accessibleMetricsDescription}`,
		};
	}
}

interface EntityViewModel {
	readonly kind: string;
	readonly path: readonly string[];
	readonly pathKinds: readonly string[];
	readonly rangeStart: number;
	entityLink: vscode.Uri | undefined;
	readonly changes: ClassifiedChange[];
	metrics: EntityChangeMetrics | undefined;
	readonly explanationRequests: EntityExplanationRequest[];
}

interface MutableEntityTreeNode {
	readonly label: string;
	readonly kind: string;
	readonly path: readonly string[];
	readonly children: Map<string, MutableEntityTreeNode>;
	rangeStart: number;
	entity: EntityViewModel | undefined;
}

interface ComplexityDelta {
	readonly cognitiveComplexity: number;
	readonly cyclomaticComplexity: number;
}

interface EntityChangeMetrics {
	readonly complexity: ComplexityDelta | undefined;
	readonly runtimeComplexity: RuntimeComplexityChange | undefined;
}

interface RuntimeComplexityChange {
	readonly original: string | undefined;
	readonly modified: string | undefined;
}

interface EntityChangeExplanation {
	readonly change: ClassifiedChange;
	readonly explanation: string;
}

interface EntityExplanationRequest {
	readonly change: ClassifiedChange;
	readonly request: TypeScriptChangeToExplain;
}

class ChangedEntityItem {
	readonly treeItem: vscode.TreeItem;

	readonly children: readonly ChangedEntityItem[];
	readonly complexityRollup: ComplexityDelta | undefined;
	readonly fallbackTooltip: string;
	private readonly explanationRequests: readonly EntityExplanationRequest[];
	private readonly filePath: string;
	private readonly tooltipLabel: string;
	private readonly tooltipDescription: string | undefined;

	constructor(fileId: string, filePath: string, node: MutableEntityTreeNode) {
		this.filePath = filePath;
		this.explanationRequests = node.entity?.explanationRequests ?? [];
		this.children = Array.from(node.children.values())
			.sort(compareEntityTreeNodes)
			.map(child => new ChangedEntityItem(fileId, filePath, child));
		this.complexityRollup = rollUpComplexity(node.entity?.metrics, this.children);
		this.treeItem = new vscode.TreeItem(
			node.label,
			this.children.length === 0 ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded,
		);
		this.treeItem.id = `${changedEntitiesViewId}.entity.${fileId}.${JSON.stringify(node.path)}`;
		this.treeItem.iconPath = new vscode.ThemeIcon(getEntityIcon(node.kind));

		const fullLabel = node.path.length === 0 ? node.label : node.path.join('.');
		this.tooltipLabel = fullLabel;
		const kindLabel = getEntityKindLabel(node.kind);
		const metricsDescription = formatMetrics(this.complexityRollup, node.entity?.metrics?.runtimeComplexity);
		const accessibleMetricsDescription = formatAccessibleMetrics(this.complexityRollup, node.entity?.metrics?.runtimeComplexity);
		if (node.entity === undefined) {
			this.treeItem.description = metricsDescription;
			this.treeItem.tooltip = metricsDescription === undefined ? fullLabel : l10n.t`${fullLabel} — ${metricsDescription}`;
			this.fallbackTooltip = this.treeItem.tooltip;
			this.tooltipDescription = undefined;
			this.treeItem.contextValue = 'copilotChangedEntityGroup';
			this.treeItem.accessibilityInformation = {
				label: accessibleMetricsDescription === undefined
					? l10n.t`${fullLabel}, ${kindLabel} changed entity group`
					: l10n.t`${fullLabel}, ${kindLabel} changed entity group, ${accessibleMetricsDescription}`,
			};
			return;
		}

		const changesDescription = formatChanges(node.entity.changes);
		const description = metricsDescription === undefined
			? changesDescription
			: l10n.t`${changesDescription} — ${metricsDescription}`;
		const accessibleDescription = accessibleMetricsDescription === undefined
			? changesDescription
			: l10n.t`${changesDescription}, ${accessibleMetricsDescription}`;
		this.treeItem.description = description;
		this.fallbackTooltip = formatEntityTooltipCaption(fullLabel, description);
		this.tooltipDescription = description;
		this.treeItem.contextValue = 'copilotChangedEntity';
		this.treeItem.accessibilityInformation = {
			label: node.entity.entityLink === undefined
				? l10n.t`${fullLabel}, ${kindLabel}, ${accessibleDescription}`
				: l10n.t`${fullLabel}, ${kindLabel}, ${accessibleDescription}. Open diff`,
		};
		if (node.entity.entityLink !== undefined) {
			this.treeItem.command = {
				command: openChangedEntityDiffCommand,
				title: l10n.t`Open Entity Diff`,
				arguments: [node.entity.entityLink],
			};
		}
	}

	get canExplain(): boolean {
		return this.explanationRequests.length > 0;
	}

	async resolveTooltip(codeReviewService: ICodeReviewService, token: vscode.CancellationToken): Promise<string | vscode.MarkdownString> {
		const explanations = await codeReviewService.explainChanges({
			filePath: this.filePath,
			changes: this.explanationRequests.map(request => request.request),
		}, token);
		if (explanations === undefined) {
			return this.fallbackTooltip;
		}
		if (this.tooltipDescription === undefined) {
			return this.fallbackTooltip;
		}
		const explanationsById = new Map(explanations.map(explanation => [explanation.id, explanation.explanation]));
		const resolvedExplanations = this.explanationRequests.flatMap(request => {
			const explanation = explanationsById.get(request.request.id);
			return explanation === undefined ? [] : [{ change: request.change, explanation }];
		});
		return resolvedExplanations.length === 0
			? this.fallbackTooltip
			: formatEntityTooltip(this.tooltipLabel, this.tooltipDescription, resolvedExplanations);
	}
}

function createEntityTreeItems(fileId: string, filePath: string, entities: readonly EntityViewModel[]): ChangedEntityItem[] {
	const roots = new Map<string, MutableEntityTreeNode>();
	for (const entity of entities) {
		if (entity.path.length === 0) {
			roots.set('', {
				label: l10n.t`File`,
				kind: 'sourceFile',
				path: entity.path,
				children: new Map(),
				rangeStart: entity.rangeStart,
				entity,
			});
			continue;
		}

		let children = roots;
		const path: string[] = [];
		for (let index = 0; index < entity.path.length; index++) {
			const segment = entity.path[index];
			const kind = entity.pathKinds[index];
			path.push(segment);
			let node = children.get(segment);
			if (node === undefined) {
				node = {
					label: segment,
					kind,
					path: [...path],
					children: new Map(),
					rangeStart: entity.rangeStart,
					entity: undefined,
				};
				children.set(segment, node);
			} else {
				node.rangeStart = Math.min(node.rangeStart, entity.rangeStart);
			}
			if (index === entity.path.length - 1) {
				node.entity = entity;
			}
			children = node.children;
		}
	}

	return Array.from(roots.values())
		.sort(compareEntityTreeNodes)
		.map(root => new ChangedEntityItem(fileId, filePath, root));
}

function compareEntityTreeNodes(left: MutableEntityTreeNode, right: MutableEntityTreeNode): number {
	return left.rangeStart - right.rangeStart || left.label.localeCompare(right.label);
}

function indexMetrics(result: TypeScriptMetricsResult | undefined): ReadonlyMap<string, TypeScriptMetrics> {
	return new Map(result?.entities.map(entity => [getPathKey(entity.path), entity.metrics]));
}

function getPathKey(path: readonly string[]): string {
	return JSON.stringify(path);
}

function getRangeKey(range: { readonly start: number; readonly end: number }): string {
	return `${range.start}:${range.end}`;
}

function getLines(content: string, range: { readonly start: number; readonly end: number }): string {
	const result = content.split(/\r\n|\r|\n/).slice(range.start, range.end).join('\n');
	if (result.length <= maxExplanationSnippetLength) {
		return result;
	}
	const omittedMarker = '\n... omitted ...\n';
	const endLength = Math.floor(maxExplanationSnippetLength / 4);
	const startLength = maxExplanationSnippetLength - endLength - omittedMarker.length;
	return `${result.slice(0, startLength)}${omittedMarker}${result.slice(-endLength)}`;
}

function affectsCode(bucket: TypeScriptChangeBucket): boolean {
	return changesAffectCode(bucket.changes);
}

function changesAffectCode(changes: readonly ClassifiedChange[]): boolean {
	return changes.some(change => change.classifications.some(classification =>
		classification.classification === TypeScriptChangeClassification.Statement
		|| classification.classification === TypeScriptChangeClassification.Declaration));
}

function changesAffectStatements(changes: readonly ClassifiedChange[]): boolean {
	return changes.some(change => change.classifications.some(classification => classification.classification === TypeScriptChangeClassification.Statement));
}

function computeChangeMetrics(modified: TypeScriptMetrics | undefined, original: TypeScriptMetrics | undefined, includeComplexity: boolean): EntityChangeMetrics | undefined {
	if (modified === undefined && original === undefined) {
		return undefined;
	}
	const runtimeComplexity = modified?.runtimeComplexity === original?.runtimeComplexity
		? undefined
		: { original: original?.runtimeComplexity, modified: modified?.runtimeComplexity };
	return {
		complexity: includeComplexity
			? {
				cognitiveComplexity: (modified?.cognitiveComplexity ?? 0) - (original?.cognitiveComplexity ?? 0),
				cyclomaticComplexity: (modified?.cyclomaticComplexity ?? 0) - (original?.cyclomaticComplexity ?? 0),
			}
			: undefined,
		runtimeComplexity,
	};
}

function rollUpComplexity(metrics: EntityChangeMetrics | undefined, children: readonly ChangedEntityItem[]): ComplexityDelta | undefined {
	let cognitiveComplexity = metrics?.complexity?.cognitiveComplexity ?? 0;
	let cyclomaticComplexity = metrics?.complexity?.cyclomaticComplexity ?? 0;
	let hasMetrics = metrics?.complexity !== undefined;
	for (const child of children) {
		if (child.complexityRollup !== undefined) {
			hasMetrics = true;
			cognitiveComplexity += child.complexityRollup.cognitiveComplexity;
			cyclomaticComplexity += child.complexityRollup.cyclomaticComplexity;
		}
	}
	return hasMetrics ? { cognitiveComplexity, cyclomaticComplexity } : undefined;
}

function formatMetrics(complexity: ComplexityDelta | undefined, runtimeComplexity: RuntimeComplexityChange | undefined): string | undefined {
	const parts: string[] = [];
	if (complexity !== undefined && hasComplexityDelta(complexity)) {
		parts.push(l10n.t`CC: [${formatDelta(complexity.cognitiveComplexity)}/${formatDelta(complexity.cyclomaticComplexity)}]`);
	}
	if (runtimeComplexity !== undefined) {
		parts.push(formatRuntimeComplexity(runtimeComplexity));
	}
	return parts.length === 0 ? undefined : parts.join(', ');
}

function formatAccessibleMetrics(complexity: ComplexityDelta | undefined, runtimeComplexity: RuntimeComplexityChange | undefined): string | undefined {
	const parts: string[] = [];
	if (complexity !== undefined && hasComplexityDelta(complexity)) {
		parts.push(l10n.t`cognitive complexity ${formatAccessibleDelta(complexity.cognitiveComplexity)}, cyclomatic complexity ${formatAccessibleDelta(complexity.cyclomaticComplexity)}`);
	}
	if (runtimeComplexity !== undefined) {
		parts.push(formatAccessibleRuntimeComplexity(runtimeComplexity));
	}
	return parts.length === 0 ? undefined : parts.join(', ');
}

function hasComplexityDelta(complexity: ComplexityDelta): boolean {
	return complexity.cognitiveComplexity !== 0 || complexity.cyclomaticComplexity !== 0;
}

function formatRuntimeComplexity(runtime: RuntimeComplexityChange): string {
	if (runtime.original !== undefined && runtime.modified !== undefined) {
		return l10n.t`Runtime: ${runtime.original} -> ${runtime.modified}`;
	}
	return l10n.t`Runtime: ${getOneSidedRuntimeComplexity(runtime)}`;
}

function formatAccessibleRuntimeComplexity(runtime: RuntimeComplexityChange): string {
	if (runtime.original !== undefined && runtime.modified !== undefined) {
		return l10n.t`runtime complexity changed from ${runtime.original} to ${runtime.modified}`;
	}
	return l10n.t`runtime complexity ${getOneSidedRuntimeComplexity(runtime)}`;
}

function getOneSidedRuntimeComplexity(runtime: RuntimeComplexityChange): string {
	const value = runtime.modified ?? runtime.original;
	if (value === undefined) {
		throw new Error('Runtime complexity change must contain an original or modified value');
	}
	return value;
}

function formatDelta(value: number): string {
	return value > 0 ? `+${value}` : value.toString();
}

function formatAccessibleDelta(value: number): string {
	if (value > 0) {
		return l10n.t`increased by ${value}`;
	}
	if (value < 0) {
		return l10n.t`decreased by ${Math.abs(value)}`;
	}
	return l10n.t`unchanged`;
}

function formatEntityTooltipCaption(fullLabel: string, description: string): string {
	return l10n.t`${fullLabel} — ${description}`;
}

function formatEntityTooltip(fullLabel: string, description: string, explanations: readonly EntityChangeExplanation[]): vscode.MarkdownString {
	const tooltip = new vscode.MarkdownString(undefined, false);
	tooltip.isTrusted = false;
	tooltip.supportHtml = false;
	tooltip.appendMarkdown('**');
	tooltip.appendText(formatEntityTooltipCaption(fullLabel, description));
	tooltip.appendMarkdown('**');
	for (const explanation of explanations) {
		tooltip.appendMarkdown('\n\n');
		tooltip.appendText(explanation.explanation);
	}
	return tooltip;
}

class MessageItem {
	private constructor(readonly treeItem: vscode.TreeItem) { }

	static unavailable(): MessageItem {
		return MessageItem.create(l10n.t`Change classification is unavailable`, 'info');
	}

	static empty(): MessageItem {
		return MessageItem.create(l10n.t`No classified changes found`, 'info');
	}

	static error(): MessageItem {
		return MessageItem.create(l10n.t`Unable to classify changes`, 'warning');
	}

	private static create(label: string, icon: string): MessageItem {
		const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
		item.iconPath = new vscode.ThemeIcon(icon);
		item.accessibilityInformation = { label };
		return new MessageItem(item);
	}
}

function isAddedStatus(status: number): boolean {
	return status === 1 /* Status.INDEX_ADDED */
		|| status === 7 /* Status.UNTRACKED */
		|| status === 9 /* Status.INTENT_TO_ADD */
		|| status === 12 /* Status.ADDED_BY_US */
		|| status === 13 /* Status.ADDED_BY_THEM */
		|| status === 16 /* Status.BOTH_ADDED */;
}

function isDeletedStatus(status: number): boolean {
	return status === 2 /* Status.INDEX_DELETED */
		|| status === 6 /* Status.DELETED */
		|| status === 14 /* Status.DELETED_BY_US */
		|| status === 15 /* Status.DELETED_BY_THEM */
		|| status === 17 /* Status.BOTH_DELETED */;
}

function formatChanges(changes: readonly ClassifiedChange[]): string {
	const labels = new Set<string>();
	for (const change of changes) {
		for (const classification of change.classifications) {
			const label = formatChange(classification.classification, change.changeType);
			labels.add(classification.tags.includes('test') ? l10n.t`${label} (Test)` : label);
		}
	}
	return Array.from(labels).join(', ');
}

function formatChange(classification: TypeScriptChangeClassification, changeType: 'added' | 'changed' | 'deleted'): string {
	switch (classification) {
		case TypeScriptChangeClassification.Declaration:
			switch (changeType) {
				case 'added': return l10n.t`Declaration addition`;
				case 'changed': return l10n.t`Declaration change`;
				case 'deleted': return l10n.t`Declaration deletion`;
			}
		case TypeScriptChangeClassification.Signature:
			switch (changeType) {
				case 'added': return l10n.t`Signature addition`;
				case 'changed': return l10n.t`Signature change`;
				case 'deleted': return l10n.t`Signature deletion`;
			}
		case TypeScriptChangeClassification.Statement:
			switch (changeType) {
				case 'added': return l10n.t`Statement addition`;
				case 'changed': return l10n.t`Statement change`;
				case 'deleted': return l10n.t`Statement deletion`;
			}
		case TypeScriptChangeClassification.Import:
			switch (changeType) {
				case 'added': return l10n.t`Import addition`;
				case 'changed': return l10n.t`Import change`;
				case 'deleted': return l10n.t`Import deletion`;
			}
		case TypeScriptChangeClassification.Other:
			switch (changeType) {
				case 'added': return l10n.t`Other addition`;
				case 'changed': return l10n.t`Other change`;
				case 'deleted': return l10n.t`Other deletion`;
			}
	}
}

function getEntityIcon(kind: string): string {
	switch (kind) {
		case 'sourceFile': return 'symbol-file';
		case 'class': return 'symbol-class';
		case 'constructor':
		case 'method': return 'symbol-method';
		case 'function':
		case 'arrow-function': return 'symbol-function';
		case 'getter':
		case 'setter':
		case 'property': return 'symbol-property';
		case 'interface': return 'symbol-interface';
		case 'enum':
		case 'enum-member': return 'symbol-enum';
		case 'module': return 'symbol-namespace';
		case 'object': return 'symbol-object';
		case 'type-alias': return 'symbol-type-parameter';
		default: return 'symbol-misc';
	}
}

function getEntityKindLabel(kind: string): string {
	switch (kind) {
		case 'sourceFile': return l10n.t`file`;
		case 'class': return l10n.t`class`;
		case 'constructor': return l10n.t`constructor`;
		case 'method': return l10n.t`method`;
		case 'function':
		case 'arrow-function': return l10n.t`function`;
		case 'getter': return l10n.t`getter`;
		case 'setter': return l10n.t`setter`;
		case 'property': return l10n.t`property`;
		case 'interface': return l10n.t`interface`;
		case 'enum': return l10n.t`enum`;
		case 'enum-member': return l10n.t`enum member`;
		case 'module': return l10n.t`namespace`;
		case 'object': return l10n.t`object`;
		case 'type-alias': return l10n.t`type alias`;
		default: return l10n.t`entity`;
	}
}
