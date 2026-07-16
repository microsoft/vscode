/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { ContextKind, type ContextItem, type SnippetContext, type TraitContext } from '../../../platform/languageServer/common/languageContextService';
import * as protocol from '../common/serverProtocol';
import { type ContextItemSummary, type IInternalLanguageContextService, type OnCachePopulatedEvent, type OnContextComputedEvent, type OnContextComputedOnTimeoutEvent, type ResolvedRunnableResult } from './types';

class TreePropertyItem {

	private readonly parent: TreeContextItem | TreeYieldedContextItem | TreeCacheInfo | TreeRunnableResult;
	private readonly name: string;
	private readonly value: string;

	constructor(parent: TreeContextItem | TreeYieldedContextItem | TreeCacheInfo | TreeRunnableResult, name: string, value: string) {
		this.parent = parent;
		this.name = name;
		this.value = value;
	}

	public toTreeItem(): vscode.TreeItem {
		const item = new vscode.TreeItem(`${this.name} = ${this.value}`, vscode.TreeItemCollapsibleState.None);
		item.tooltip = this.createTooltip();
		item.id = this.id;
		return item;
	}

	protected createTooltip(): vscode.MarkdownString {
		const markdown = new vscode.MarkdownString(`${this.value}`);
		return markdown;
	}

	private get id(): string | undefined {
		return this.parent instanceof TreeContextItem ? `${this.parent.id}.${this.name}` : undefined;
	}
}

abstract class TreeContextItem {

	protected parent: TreeRunnableResult;
	protected abstract from: protocol.FullContextItem;
	public abstract id: string;

	constructor(parent: TreeRunnableResult) {
		this.parent = parent;
	}

	protected createTooltip(): vscode.MarkdownString {
		const markdown = new vscode.MarkdownString(`**${this.getLabel()}**\n\n`);
		markdown.appendCodeblock(JSON.stringify(this.from, undefined, 2), 'json');
		return markdown;
	}

	protected abstract getLabel(): string;
}

class TreeTrait extends TreeContextItem {

	public readonly from: protocol.Trait;

	constructor(parent: TreeRunnableResult, from: protocol.Trait) {
		super(parent);
		this.from = from;
	}

	protected getLabel(): string {
		return 'Trait';
	}

	public get id(): string {
		return `${this.parent.id}.${this.from.key}`;
	}

	public children(): TreePropertyItem[] {
		const properties: TreePropertyItem[] = [];
		properties.push(new TreePropertyItem(this, 'key', this.from.key));
		properties.push(new TreePropertyItem(this, 'name', this.from.name));
		properties.push(new TreePropertyItem(this, 'value', this.from.value));
		return properties;
	}

	public toTreeItem(): vscode.TreeItem {
		const label = `Trait: ${this.from.value}`;
		const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
		item.tooltip = this.createTooltip();
		item.id = this.id;
		return item;
	}
}

class TreeSnippet extends TreeContextItem {

	public readonly from: protocol.CodeSnippet;

	constructor(parent: TreeRunnableResult, from: protocol.CodeSnippet) {
		super(parent);
		this.from = from;
	}

	protected getLabel(): string {
		return 'Snippet';
	}

	public get id(): string {
		return `${this.parent.id}.${this.from.key ?? Date.now().toString()}`;
	}

	public children(): TreePropertyItem[] {
		const properties: TreePropertyItem[] = [];
		properties.push(new TreePropertyItem(this, 'key', this.from.key ?? 'undefined'));
		properties.push(new TreePropertyItem(this, 'value', this.from.value));
		properties.push(new TreePropertyItem(this, 'path', this.from.fileName));
		return properties;
	}

	public toTreeItem(): vscode.TreeItem {
		const label = `Snippet: ${this.from.value}`;
		const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
		item.tooltip = this.createTooltip();
		item.id = this.id;
		return item;
	}
}


class TreeCacheInfo {

	private readonly from: protocol.CacheInfo;

	constructor(from: protocol.CacheInfo) {
		this.from = from;
	}

	public toTreeItem(): vscode.TreeItem {
		const item = new vscode.TreeItem(this.getLabel());
		item.collapsibleState = this.from.scope.kind === protocol.CacheScopeKind.OutsideRange || this.from.scope.kind === protocol.CacheScopeKind.WithinRange ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
		return item;
	}

	public children(): TreePropertyItem[] {
		const properties: TreePropertyItem[] = [];
		const scope = this.from.scope;
		if (scope.kind === protocol.CacheScopeKind.WithinRange) {
			properties.push(new TreePropertyItem(this, '0', this.getRangeString(scope.range)));
		} else if (scope.kind === protocol.CacheScopeKind.OutsideRange) {
			for (let i = 0; i < scope.ranges.length; i++) {
				properties.push(new TreePropertyItem(this, `${i}`, this.getRangeString(scope.ranges[i])));
			}
		}
		return properties;
	}

	private getLabel(): string {
		return `Cache Info: ${this.getEmitMode()} - ${this.getScope()}`;
	}

	private getEmitMode(): string {
		switch (this.from.emitMode) {
			case protocol.EmitMode.ClientBased:
				return 'Client Based';
			case protocol.EmitMode.ClientBasedOnTimeout:
				return 'On Timeout';
			default:
				return 'Unknown';
		}
	}

	private getScope(): string {
		switch (this.from.scope.kind) {
			case protocol.CacheScopeKind.File:
				return 'whole file';
			case protocol.CacheScopeKind.NeighborFiles:
				return 'neighbor files';
			case protocol.CacheScopeKind.OutsideRange:
				return 'outside ranges';
			case protocol.CacheScopeKind.WithinRange:
				return 'within range';
			default:
				return 'unknown scope';
		}
	}

	private getRangeString(range: protocol.Range): string {
		return `[${range.start.line + 1}:${range.start.character + 1} - ${range.end.line + 1}:${range.end.character + 1}]`;
	}
}

class TreeRunnableResult {

	private readonly parent: TreeContextRequest;
	private readonly from: ResolvedRunnableResult;
	private readonly items: (TreeTrait | TreeSnippet)[];

	constructor(parent: TreeContextRequest, from: ResolvedRunnableResult) {
		this.parent = parent;
		this.from = from;
		this.items = from.items.map(item => {
			if (item.kind === protocol.ContextKind.Trait) {
				return new TreeTrait(this, item);
			} else if (item.kind === protocol.ContextKind.Snippet) {
				return new TreeSnippet(this, item);
			} else {
				throw new Error(`Unknown context item kind: ${item.kind}`);
			}
		});
	}

	public get id(): string {
		return `${this.parent.id}.${this.from.id}`;
	}

	public children(): (TreeTrait | TreeSnippet | TreeCacheInfo | TreePropertyItem)[] {
		const result: (TreeTrait | TreeSnippet | TreeCacheInfo | TreePropertyItem)[] = this.items;
		if (this.from.cache !== undefined) {
			result.push(new TreeCacheInfo(this.from.cache));
		}
		result.push(new TreePropertyItem(this, 'priority', this.from.priority.toString()));
		if (this.from.debugPath !== undefined) {
			result.push(new TreePropertyItem(this, 'debugPath', this.from.debugPath));
		}

		return result;
	}

	public toTreeItem(): vscode.TreeItem {
		let id = this.from.id;
		if (id.startsWith('_')) {
			id = id.substring(1); // Remove leading underscore for display purposes
		}
		const cacheInfo = this.from.cache !== undefined ? 1 : 0;
		let label = `${id} - ${this.items.length} items - ${this.from.state}`;
		if (this.parent.summary.serverComputed?.has(this.from.id)) {
			label += ' - ⏳';
		}
		const item = new vscode.TreeItem(label, this.items.length + cacheInfo > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		item.id = this.id;
		item.tooltip = this.createTooltip();
		return item;

	}

	private createTooltip(): vscode.MarkdownString {
		let id = this.from.id;
		if (id.startsWith('_')) {
			id = id.substring(1);
		}
		const markdown = new vscode.MarkdownString(`**${id}** - ${this.items.length} items\n\n`);
		markdown.appendCodeblock(JSON.stringify(this.from, undefined, 2), 'json');
		return markdown;
	}
}

class TreeYieldedSnippet {

	protected readonly from: SnippetContext;

	constructor(from: SnippetContext) {
		this.from = from;
	}

	public toTreeItem(): vscode.TreeItem {
		const item = new vscode.TreeItem(`${this.getLabel()}: ${this.from.value}`, vscode.TreeItemCollapsibleState.Collapsed);
		item.tooltip = this.createTooltip();
		return item;
	}

	protected getLabel(): string {
		return 'Snippet';
	}

	public children(): TreePropertyItem[] {
		return [
			new TreePropertyItem(this, 'kind', this.from.kind),
			new TreePropertyItem(this, 'value', this.from.value),
			new TreePropertyItem(this, 'priority', this.from.priority.toString()),
			new TreePropertyItem(this, 'uri', this.from.uri.toString())
		];
	}

	protected createTooltip(): vscode.MarkdownString {
		const markdown = new vscode.MarkdownString(`**${this.getLabel()}**\n\n`);
		const json = {
			kind: this.from.kind,
			priority: this.from.priority,
			uri: this.from.uri.toString(),
			value: this.from.value
		};
		markdown.appendCodeblock(JSON.stringify(json, undefined, 2), 'json');
		return markdown;
	}
}

class TreeYieldedTrait {

	protected readonly from: TraitContext;

	constructor(from: TraitContext) {
		this.from = from;
	}

	public toTreeItem(): vscode.TreeItem {
		const item = new vscode.TreeItem(`${this.getLabel()}: ${this.from.value}`, vscode.TreeItemCollapsibleState.Collapsed);
		item.tooltip = this.createTooltip();
		return item;
	}

	protected getLabel(): string {
		return 'Trait';
	}

	public children(): TreePropertyItem[] {
		return [
			new TreePropertyItem(this, 'kind', this.from.kind),
			new TreePropertyItem(this, 'name', this.from.name),
			new TreePropertyItem(this, 'value', this.from.value),
			new TreePropertyItem(this, 'priority', this.from.priority.toString())
		];
	}

	protected createTooltip(): vscode.MarkdownString {
		const markdown = new vscode.MarkdownString(`**${this.getLabel()}**\n\n`);
		const json = {
			kind: this.from.kind,
			priority: this.from.priority,
			name: this.from.name,
			value: this.from.value
		};
		markdown.appendCodeblock(JSON.stringify(json, undefined, 2), 'json');
		return markdown;
	}
}

type TreeYieldedContextItem = TreeYieldedSnippet | TreeYieldedTrait;

class TreeYielded {

	private readonly parent: TreeContextRequest;
	private readonly items: ReadonlyArray<ContextItem>;

	constructor(parent: TreeContextRequest, items: ReadonlyArray<ContextItem>) {
		this.parent = parent;
		this.items = items;
	}

	public children(): TreeYieldedContextItem[] {
		const children: TreeYieldedContextItem[] = [];
		for (const item of this.items) {
			if (item.kind === ContextKind.Snippet) {
				children.push(new TreeYieldedSnippet(item as SnippetContext));
			} else if (item.kind === ContextKind.Trait) {
				children.push(new TreeYieldedTrait(item as TraitContext));
			}
		}
		return children;
	}

	public toTreeItem(): vscode.TreeItem {
		const label = `Yielded: ${this.items.length} items`;
		const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
		item.id = this.id;
		return item;
	}

	public get id(): string {
		return `${this.parent.id}.yielded`;
	}
}

abstract class TreeContextRequest {

	protected readonly label: string;
	protected readonly document: string;
	protected readonly position: vscode.Position;
	public readonly summary: ContextItemSummary;

	private static counter = 1;

	constructor(label: string, event: OnCachePopulatedEvent | OnContextComputedEvent | OnContextComputedOnTimeoutEvent) {
		this.document = event.document.uri.toString();
		this.position = event.position;
		this.summary = event.summary;
		const start = new Date(Date.now() - this.summary.totalTime);
		const timeString = `${start.getMinutes().toString().padStart(2, '0')}:${start.getSeconds().toString().padStart(2, '0')}.${start.getMilliseconds().toString().padStart(3, '0')}`;
		this.label = `[${timeString}] - [${this.position.line + 1}:${this.position.character + 1}] ${event.source ?? label} - ${this.summary.stats.yielded} items`;
		if (this.summary.serverComputed && this.summary.serverComputed.size > 0) {
			this.label += ` - ⏳ ${this.summary.totalTime}ms`;
		} else {
			this.label += ` - ${this.summary.totalTime}ms`;
		}
	}

	public toTreeItem(): vscode.TreeItem {
		const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Collapsed);
		item.tooltip = this.createTooltip();
		return item;
	}

	private createTooltip(): vscode.MarkdownString {
		const markdown = new vscode.MarkdownString(`**${this.label}**\n\n`);
		const json = this.createJson();
		markdown.appendCodeblock(JSON.stringify(json, undefined, 2), 'json');
		return markdown;
	}

	protected abstract createJson(): {};

	public abstract children(): (TreeRunnableResult | TreeYieldedContextItem)[];

	public get id(): string {
		return `${TreeContextRequest.counter++}`;
	}
}

class TreeCachePopulateContextRequest extends TreeContextRequest {

	private readonly items: ReadonlyArray<ResolvedRunnableResult>;

	constructor(label: string, event: OnCachePopulatedEvent) {
		super(label, event);
		this.items = event.items;
	}

	protected createJson(): {} {
		return {
			document: this.document,
			position: {
				line: this.position.line + 1,
				character: this.position.character + 1
			},
			runnables: this.items.length,
			cached: `${this.summary.cachedItems}/${this.summary.stats.total} cached`,
			timings: {
				totalTime: this.summary.totalTime,
				serverTime: this.summary.serverTime,
				contextComputeTime: this.summary.contextComputeTime,
			},
		};
	}

	public override children(): (TreeRunnableResult | TreeYieldedContextItem)[] {
		const result: (TreeRunnableResult | TreeYieldedContextItem)[] = [];
		for (const item of this.items) {
			result.push(new TreeRunnableResult(this, item));
		}
		return result;
	}
}

class TreeYieldContextRequest extends TreeContextRequest {

	private readonly items: ReadonlyArray<ContextItem>;

	constructor(label: string, event: OnContextComputedEvent | OnContextComputedOnTimeoutEvent) {
		super(label, event);
		this.items = event.items;
	}

	protected createJson(): {} {
		return {
			document: this.document,
			position: {
				line: this.position.line + 1,
				character: this.position.character + 1
			},
			items: this.items.length,
			cached: `${this.summary.cachedItems}/${this.summary.stats.total} cached`,
			timings: {
				totalTime: this.summary.totalTime,
				serverTime: this.summary.serverTime,
				contextComputeTime: this.summary.contextComputeTime,
			},
		};
	}

	public override children(): TreeYieldedContextItem[] {
		const children: TreeYieldedContextItem[] = [];
		for (const item of this.items) {
			if (item.kind === ContextKind.Snippet) {
				children.push(new TreeYieldedSnippet(item as SnippetContext));
			} else if (item.kind === ContextKind.Trait) {
				children.push(new TreeYieldedTrait(item as TraitContext));
			}
		}
		return children;
	}

	public override toTreeItem(): vscode.TreeItem {
		const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Collapsed);
		item.id = this.id;
		return item;
	}
}

type InspectorItems = TreeContextRequest | TreeRunnableResult | TreeTrait | TreeSnippet | TreePropertyItem | TreeYielded | TreeYieldedSnippet | TreeYieldedTrait | TreeCacheInfo;
export class InspectorDataProvider implements vscode.TreeDataProvider<InspectorItems> {

	private readonly languageContextService: IInternalLanguageContextService;

	private readonly _onDidChangeTreeData: vscode.EventEmitter<InspectorItems | InspectorItems[] | undefined | null | void>;
	public readonly onDidChangeTreeData: vscode.Event<InspectorItems | InspectorItems[] | undefined | null | void>;

	private items: TreeContextRequest[];

	constructor(languageContextService: IInternalLanguageContextService) {
		this.languageContextService = languageContextService;
		this._onDidChangeTreeData = new vscode.EventEmitter<InspectorItems | InspectorItems[] | undefined | null | void>();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
		this.items = [];
		this.languageContextService.onCachePopulated((event) => {
			this.addContextRequest(new TreeCachePopulateContextRequest(`Cache`, event));
		});
		this.languageContextService.onContextComputed((event) => {
			this.addContextRequest(new TreeYieldContextRequest(`Context`, event));
		});
		this.languageContextService.onContextComputedOnTimeout((event) => {
			this.addContextRequest(new TreeYieldContextRequest(`OnTimeout`, event));
		});
	}

	private addContextRequest(item: TreeContextRequest): void {
		if (this.items.length >= 32) {
			// Limit the number of items to avoid performance issues.
			this.items.pop();
		}
		this.items.unshift(item);
		this._onDidChangeTreeData.fire(undefined);
	}

	public getTreeItem(element: InspectorItems): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element.toTreeItem();
	}

	public getChildren(element?: InspectorItems | undefined): InspectorItems[] {
		if (this.items.length === 0) {
			return [];
		}

		if (element === undefined) {
			return this.items;
		} else if (
			element instanceof TreeRunnableResult || element instanceof TreeTrait || element instanceof TreeSnippet || element instanceof TreeYielded ||
			element instanceof TreeYieldedSnippet || element instanceof TreeYieldedTrait || element instanceof TreeCacheInfo || element instanceof TreeContextRequest) {

			return element.children();
		}
		return [];
	}
}