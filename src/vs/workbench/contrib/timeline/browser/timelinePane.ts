/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/timelinePane.css';
import { localize, localize2 } from '../../../../nls.js';
import * as DOM from '../../../../base/browser/dom.js';
import * as css from '../../../../base/browser/cssValue.js';
import { IAction, ActionRunner } from '../../../../base/common/actions.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { fromNow } from '../../../../base/common/date.js';
import { debounce } from '../../../../base/common/decorators.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore, createMatches } from '../../../../base/common/filters.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { DisposableStore, IDisposable, Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IListVirtualDelegate, IIdentityProvider, IKeyboardNavigationLabelProvider } from '../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeRenderer, ITreeContextMenuEvent, ITreeElement } from '../../../../base/browser/ui/tree/tree.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService, IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ITimelineService, TimelineChangeEvent, TimelineItem, TimelineOptions, TimelineProvidersChangeEvent, TimelineRequest, Timeline } from '../common/timeline.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { SideBySideEditor, EditorResourceAccessor } from '../../../common/editor.js';
import { ICommandService, CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ActionBar, IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { getContextMenuActions, createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, registerAction2, Action2, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { isString } from '../../../../base/common/types.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { AriaRole } from '../../../../base/browser/ui/aria/aria.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';

const ItemHeight = 22;

type TreeElement = TimelineItem | LoadMoreCommand;

function isLoadMoreCommand(item: TreeElement | undefined): item is LoadMoreCommand {
	return item instanceof LoadMoreCommand;
}

function isTimelineItem(item: TreeElement | undefined): item is TimelineItem {
	return !!item && !item.handle.startsWith('vscode-command:');
}

function updateRelativeTime(item: TimelineItem, lastRelativeTime: string | undefined): string | undefined {
	item.relativeTime = isTimelineItem(item) ? fromNow(item.timestamp) : undefined;
	item.relativeTimeFullWord = isTimelineItem(item) ? fromNow(item.timestamp, false, true) : undefined;
	if (lastRelativeTime === undefined || item.relativeTime !== lastRelativeTime) {
		lastRelativeTime = item.relativeTime;
		item.hideRelativeTime = false;
	} else {
		item.hideRelativeTime = true;
	}

	return lastRelativeTime;
}

interface TimelineActionContext {
	uri: URI | undefined;
	item: TreeElement;
}

class TimelineAggregate {
	readonly items: TimelineItem[];
	readonly source: string;

	lastRenderedIndex: number;

	constructor(timeline: Timeline) {
		this.source = timeline.source;
		this.items = timeline.items;
		this._cursor = timeline.paging?.cursor;
		this.lastRenderedIndex = -1;
	}

	private _cursor?: string;
	get cursor(): string | undefined {
		return this._cursor;
	}

	get more(): boolean {
		return this._cursor !== undefined;
	}

	get newest(): TimelineItem | undefined {
		return this.items[0];
	}

	get oldest(): TimelineItem | undefined {
		return this.items[this.items.length - 1];
	}

	add(timeline: Timeline, options: TimelineOptions) {
		let updated = false;

		if (timeline.items.length !== 0 && this.items.length !== 0) {
			updated = true;

			const ids = new Set();
			const timestamps = new Set();

			for (const item of timeline.items) {
				if (item.id === undefined) {
					timestamps.add(item.timestamp);
				}
				else {
					ids.add(item.id);
				}
			}

			// Remove any duplicate items
			let i = this.items.length;
			let item;
			while (i--) {
				item = this.items[i];
				if ((item.id !== undefined && ids.has(item.id)) || timestamps.has(item.timestamp)) {
					this.items.splice(i, 1);
				}
			}

			if ((timeline.items[timeline.items.length - 1]?.timestamp ?? 0) >= (this.newest?.timestamp ?? 0)) {
				this.items.splice(0, 0, ...timeline.items);
			} else {
				this.items.push(...timeline.items);
			}
		} else if (timeline.items.length !== 0) {
			updated = true;

			this.items.push(...timeline.items);
		}

		// If we are not requesting more recent items than we have, then update the cursor
		if (options.cursor !== undefined || typeof options.limit !== 'object') {
			this._cursor = timeline.paging?.cursor;
		}

		if (updated) {
			this.items.sort(
				(a, b) =>
					(b.timestamp - a.timestamp) ||
					(a.source === undefined
						? b.source === undefined ? 0 : 1
						: b.source === undefined ? -1 : b.source.localeCompare(a.source, undefined, { numeric: true, sensitivity: 'base' }))
			);
		}

		return updated;
	}

	private _stale = false;
	get stale() {
		return this._stale;
	}

	private _requiresReset = false;
	get requiresReset(): boolean {
		return this._requiresReset;
	}

	invalidate(requiresReset: boolean) {
		this._stale = true;
		this._requiresReset = requiresReset;
	}
}

class LoadMoreCommand {
	readonly handle = 'vscode-command:loadMore';
	readonly timestamp = 0;
	readonly description = undefined;
	readonly tooltip = undefined;
	readonly contextValue = undefined;
	// Make things easier for duck typing
	readonly id = undefined;
	readonly icon = undefined;
	readonly iconDark = undefined;
	readonly source = undefined;
	readonly relativeTime = undefined;
	readonly relativeTimeFullWord = undefined;
	readonly hideRelativeTime = undefined;

	constructor(loading: boolean) {
		this._loading = loading;
	}
	private _loading: boolean = false;
	get loading(): boolean {
		return this._loading;
	}
	set loading(value: boolean) {
		this._loading = value;
	}

	get ariaLabel() {
		return this.label;
	}

	get label() {
		return this.loading ? localize('timeline.loadingMore', "Loading...") : localize('timeline.loadMore', "Load more");
	}

	get themeIcon(): ThemeIcon | undefined {
		return undefined;
	}
}

export const TimelineFollowActiveEditorContext = new RawContextKey<boolean>('timelineFollowActiveEditor', true, true);
export const TimelineExcludeSources = new RawContextKey<string>('timelineExcludeSources', '[]', true);
export const TimelineViewFocusedContext = new RawContextKey<boolean>('timelineFocused', true);

interface IPendingRequest extends IDisposable {
	readonly request: TimelineRequest;
}

export class TimelinePane extends ViewPane {
	static readonly TITLE: ILocalizedString = localize2('timeline', "Timeline");

	private $container!: HTMLElement;
	private $message!: HTMLDivElement;
	private $tree!: HTMLDivElement;
	private tree!: WorkbenchObjectTree<TreeElement, FuzzyScore>;
	private treeRenderer: TimelineTreeRenderer | undefined;
	private commands: TimelinePaneCommands;
	private visibilityDisposables: DisposableStore | undefined;

	private followActiveEditorContext: IContextKey<boolean>;
	private timelineExcludeSourcesContext: IContextKey<string>;

	private excludedSources: Set<string>;
	private pendingRequests = new Map<string, IPendingRequest>();
	private timelinesBySource = new Map<string, TimelineAggregate>();

	private uri: URI | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService protected editorService: IEditorService,
		@ICommandService protected commandService: ICommandService,
		@IProgressService private readonly progressService: IProgressService,
		@ITimelineService protected timelineService: ITimelineService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super({ ...options, titleMenuId: MenuId.TimelineTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.commands = this._register(this.instantiationService.createInstance(TimelinePaneCommands, this));

		this.followActiveEditorContext = TimelineFollowActiveEditorContext.bindTo(this.contextKeyService);
		this.timelineExcludeSourcesContext = TimelineExcludeSources.bindTo(this.contextKeyService);

		const excludedSourcesString = storageService.get('timeline.excludeSources', StorageScope.PROFILE, '[]');
		this.timelineExcludeSourcesContext.set(excludedSourcesString);
		this.excludedSources = new Set(JSON.parse(excludedSourcesString));

		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, 'timeline.excludeSources', this._store)(this.onStorageServiceChanged, this));
		this._register(configurationService.onDidChangeConfiguration(this.onConfigurationChanged, this));
		this._register(timelineService.onDidChangeProviders(this.onProvidersChanged, this));
		this._register(timelineService.onDidChangeTimeline(this.onTimelineChanged, this));
		this._register(timelineService.onDidChangeUri(uri => this.setUri(uri), this));
	}

	private _followActiveEditor: boolean = true;
	get followActiveEditor(): boolean {
		return this._followActiveEditor;
	}
	set followActiveEditor(value: boolean) {
		if (this._followActiveEditor === value) {
			return;
		}

		this._followActiveEditor = value;
		this.followActiveEditorContext.set(value);

		this.updateFilename(this._filename);

		if (value) {
			this.onActiveEditorChanged();
		}
	}

	private _pageOnScroll: boolean | undefined;
	get pageOnScroll() {
		if (this._pageOnScroll === undefined) {
			this._pageOnScroll = this.configurationService.getValue<boolean | null | undefined>('timeline.pageOnScroll') ?? false;
		}

		return this._pageOnScroll;
	}

	get pageSize() {
		let pageSize = this.configurationService.getValue<number | null | undefined>('timeline.pageSize');
		if (pageSize === undefined || pageSize === null) {
			// If we are paging when scrolling, then add an extra item to the end to make sure the "Load more" item is out of view
			pageSize = Math.max(20, Math.floor((this.tree?.renderHeight ?? 0 / ItemHeight) + (this.pageOnScroll ? 1 : -1)));
		}
		return pageSize;
	}

	reset() {
		this.loadTimeline(true);
	}

	setUri(uri: URI) {
		this.setUriCore(uri, true);
	}

	private setUriCore(uri: URI | undefined, disableFollowing: boolean) {
		if (disableFollowing) {
			this.followActiveEditor = false;
		}

		this.uri = uri;
		this.updateFilename(uri ? this.labelService.getUriBasenameLabel(uri) : undefined);
		this.treeRenderer?.setUri(uri);
		this.loadTimeline(true);
	}

	private onStorageServiceChanged() {
		const excludedSourcesString = this.storageService.get('timeline.excludeSources', StorageScope.PROFILE, '[]');
		this.timelineExcludeSourcesContext.set(excludedSourcesString);
		this.excludedSources = new Set(JSON.parse(excludedSourcesString));

		const missing = this.timelineService.getSources()
			.filter(({ id }) => !this.excludedSources.has(id) && !this.timelinesBySource.has(id));
		if (missing.length !== 0) {
			this.loadTimeline(true, missing.map(({ id }) => id));
		} else {
			this.refresh();
		}
	}

	private onConfigurationChanged(e: IConfigurationChangeEvent) {
		if (e.affectsConfiguration('timeline.pageOnScroll')) {
			this._pageOnScroll = undefined;
		}
	}

	private onActiveEditorChanged() {
		if (!this.followActiveEditor || !this.isExpanded()) {
			return;
		}

		const uri = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });

		if ((this.uriIdentityService.extUri.isEqual(uri, this.uri) && uri !== undefined) ||
			// Fallback to match on fsPath if we are dealing with files or git schemes
			(uri?.fsPath === this.uri?.fsPath && (uri?.scheme === Schemas.file || uri?.scheme === 'git') && (this.uri?.scheme === Schemas.file || this.uri?.scheme === 'git'))) {

			// If the uri hasn't changed, make sure we have valid caches
			for (const source of this.timelineService.getSources()) {
				if (this.excludedSources.has(source.id)) {
					continue;
				}

				const timeline = this.timelinesBySource.get(source.id);
				if (timeline !== undefined && !timeline.stale) {
					continue;
				}

				if (timeline !== undefined) {
					this.updateTimeline(timeline, timeline.requiresReset);
				} else {
					this.loadTimelineForSource(source.id, uri, true);
				}
			}

			return;
		}

		this.setUriCore(uri, false);
	}

	private onProvidersChanged(e: TimelineProvidersChangeEvent) {
		if (e.removed) {
			for (const source of e.removed) {
				this.timelinesBySource.delete(source);
			}

			this.refresh();
		}

		if (e.added) {
			this.loadTimeline(true, e.added);
		}
	}

	private onTimelineChanged(e: TimelineChangeEvent) {
		if (e?.uri === undefined || this.uriIdentityService.extUri.isEqual(URI.revive(e.uri), this.uri)) {
			const timeline = this.timelinesBySource.get(e.id);
			if (timeline === undefined) {
				return;
			}

			if (this.isBodyVisible()) {
				this.updateTimeline(timeline, e.reset);
			} else {
				timeline.invalidate(e.reset);
			}
		}
	}

	private _filename: string | undefined;
	updateFilename(filename: string | undefined) {
		this._filename = filename;
		if (this.followActiveEditor || !filename) {
			this.updateTitleDescription(filename);
		} else {
			this.updateTitleDescription(`${filename} (pinned)`);
		}
	}

	private _message: string | undefined;
	get message(): string | undefined {
		return this._message;
	}

	set message(message: string | undefined) {
		this._message = message;
		this.updateMessage();
	}

	private updateMessage(): void {
		if (this._message !== undefined) {
			this.showMessage(this._message);
		} else {
			this.hideMessage();
		}
	}

	private showMessage(message: string): void {
		if (!this.$message) {
			return;
		}
		this.$message.classList.remove('hide');
		this.resetMessageElement();

		this.$message.textContent = message;
	}

	private hideMessage(): void {
		this.resetMessageElement();
		this.$message.classList.add('hide');
	}

	private resetMessageElement(): void {
		DOM.clearNode(this.$message);
	}

	private _isEmpty = true;
	private _maxItemCount = 0;

	private _visibleItemCount = 0;
	private get hasVisibleItems() {
		return this._visibleItemCount > 0;
	}

	private clear(cancelPending: boolean) {
		this._visibleItemCount = 0;
		this._maxItemCount = this.pageSize;
		this.timelinesBySource.clear();

		if (cancelPending) {
			for (const pendingRequest of this.pendingRequests.values()) {
				pendingRequest.request.tokenSource.cancel();
				pendingRequest.dispose();
			}

			this.pendingRequests.clear();

			if (!this.isBodyVisible() && this.tree) {
				this.tree.setChildren(null, undefined);
				this._isEmpty = true;
			}
		}
	}

	private async loadTimeline(reset: boolean, sources?: string[]) {
		// If we have no source, we are resetting all sources, so cancel everything in flight and reset caches
		if (sources === undefined) {
			if (reset) {
				this.clear(true);
			}

			// TODO@eamodio: Are these the right the list of schemes to exclude? Is there a better way?
			if (this.uri?.scheme === Schemas.vscodeSettings || this.uri?.scheme === Schemas.webviewPanel || this.uri?.scheme === Schemas.walkThrough) {
				this.uri = undefined;

				this.clear(false);
				this.refresh();

				return;
			}

			if (this._isEmpty && this.uri !== undefined) {
				this.setLoadingUriMessage();
			}
		}

		if (this.uri === undefined) {
			this.clear(false);
			this.refresh();

			return;
		}

		if (!this.isBodyVisible()) {
			return;
		}

		let hasPendingRequests = false;

		for (const source of sources ?? this.timelineService.getSources().map(s => s.id)) {
			const requested = this.loadTimelineForSource(source, this.uri, reset);
			if (requested) {
				hasPendingRequests = true;
			}
		}

		if (!hasPendingRequests) {
			this.refresh();
		} else if (this._isEmpty) {
			this.setLoadingUriMessage();
		}
	}

	private loadTimelineForSource(source: string, uri: URI, reset: boolean, options?: TimelineOptions) {
		if (this.excludedSources.has(source)) {
			return false;
		}

		const timeline = this.timelinesBySource.get(source);

		// If we are paging, and there are no more items or we have enough cached items to cover the next page,
		// don't bother querying for more
		if (
			!reset &&
			options?.cursor !== undefined &&
			timeline !== undefined &&
			(!timeline?.more || timeline.items.length > timeline.lastRenderedIndex + this.pageSize)
		) {
			return false;
		}

		if (options === undefined) {
			if (
				!reset &&
				timeline !== undefined &&
				timeline.items.length > 0 &&
				!timeline.more
			) {
				// If we are not resetting, have item(s), and already know there are no more to fetch, we're done here
				return false;
			}
			options = { cursor: reset ? undefined : timeline?.cursor, limit: this.pageSize };
		}

		const pendingRequest = this.pendingRequests.get(source);
		if (pendingRequest !== undefined) {
			options.cursor = pendingRequest.request.options.cursor;

			// TODO@eamodio deal with concurrent requests better
			if (typeof options.limit === 'number') {
				if (typeof pendingRequest.request.options.limit === 'number') {
					options.limit += pendingRequest.request.options.limit;
				} else {
					options.limit = pendingRequest.request.options.limit;
				}
			}
		}
		pendingRequest?.request?.tokenSource.cancel();
		pendingRequest?.dispose();

		options.cacheResults = true;
		options.resetCache = reset;
		const tokenSource = new CancellationTokenSource();
		const newRequest = this.timelineService.getTimeline(source, uri, options, tokenSource);

		if (newRequest === undefined) {
			tokenSource.dispose();
			return false;
		}

		const disposables = new DisposableStore();
		this.pendingRequests.set(source, { request: newRequest, dispose: () => disposables.dispose() });
		disposables.add(tokenSource);
		disposables.add(tokenSource.token.onCancellationRequested(() => this.pendingRequests.delete(source)));

		this.handleRequest(newRequest);

		return true;
	}

	private updateTimeline(timeline: TimelineAggregate, reset: boolean) {
		if (reset) {
			this.timelinesBySource.delete(timeline.source);
			// Override the limit, to re-query for all our existing cached (possibly visible) items to keep visual continuity
			const { oldest } = timeline;
			this.loadTimelineForSource(timeline.source, this.uri!, true, oldest !== undefined ? { limit: { timestamp: oldest.timestamp, id: oldest.id } } : undefined);
		} else {
			// Override the limit, to query for any newer items
			const { newest } = timeline;
			this.loadTimelineForSource(timeline.source, this.uri!, false, newest !== undefined ? { limit: { timestamp: newest.timestamp, id: newest.id } } : { limit: this.pageSize });
		}
	}

	private _pendingRefresh = false;

	private async handleRequest(request: TimelineRequest) {
		let response: Timeline | undefined;
		try {
			response = await this.progressService.withProgress({ location: this.id }, () => request.result);
		} catch {
			// Ignore
		}

		// If the request was cancelled then it was already deleted from the pendingRequests map
		if (!request.tokenSource.token.isCancellationRequested) {
			this.pendingRequests.get(request.source)?.dispose();
			this.pendingRequests.delete(request.source);
		}

		if (response === undefined || request.uri !== this.uri) {
			if (this.pendingRequests.size === 0 && this._pendingRefresh) {
				this.refresh();
			}
			return;
		}

		const source = request.source;

		let updated = false;
		const timeline = this.timelinesBySource.get(source);
		if (timeline === undefined) {
			this.timelinesBySource.set(source, new TimelineAggregate(response));
			updated = true;
		}
		else {
			updated = timeline.add(response, request.options);
		}

		if (updated) {
			this._pendingRefresh = true;

			// If we have visible items already and there are other pending requests, debounce for a bit to wait for other requests
			if (this.hasVisibleItems && this.pendingRequests.size !== 0) {
				this.refreshDebounced();
			} else {
				this.refresh();
			}
		} else if (this.pendingRequests.size === 0) {
			if (this._pendingRefresh) {
				this.refresh();
			} else {
				this.tree.rerender();
			}
		}
	}

	private *getItems(): Generator<ITreeElement<TreeElement>, void, undefined> {
		let more = false;

		if (this.uri === undefined || this.timelinesBySource.size === 0) {
			this._visibleItemCount = 0;

			return;
		}

		const maxCount = this._maxItemCount;
		let count = 0;

		if (this.timelinesBySource.size === 1) {
			const [source, timeline] = Iterable.first(this.timelinesBySource)!;

			timeline.lastRenderedIndex = -1;

			if (this.excludedSources.has(source)) {
				this._visibleItemCount = 0;

				return;
			}

			if (timeline.items.length !== 0) {
				// If we have any items, just say we have one for now -- the real count will be updated below
				this._visibleItemCount = 1;
			}

			more = timeline.more;

			let lastRelativeTime: string | undefined;
			for (const item of timeline.items) {
				item.relativeTime = undefined;
				item.hideRelativeTime = undefined;

				count++;
				if (count > maxCount) {
					more = true;
					break;
				}

				lastRelativeTime = updateRelativeTime(item, lastRelativeTime);
				yield { element: item };
			}

			timeline.lastRenderedIndex = count - 1;
		}
		else {
			const sources: { timeline: TimelineAggregate; iterator: IterableIterator<TimelineItem>; nextItem: IteratorResult<TimelineItem, undefined> }[] = [];

			let hasAnyItems = false;
			let mostRecentEnd = 0;

			for (const [source, timeline] of this.timelinesBySource) {
				timeline.lastRenderedIndex = -1;

				if (this.excludedSources.has(source) || timeline.stale) {
					continue;
				}

				if (timeline.items.length !== 0) {
					hasAnyItems = true;
				}

				if (timeline.more) {
					more = true;

					const last = timeline.items[Math.min(maxCount, timeline.items.length - 1)];
					if (last.timestamp > mostRecentEnd) {
						mostRecentEnd = last.timestamp;
					}
				}

				const iterator = timeline.items[Symbol.iterator]();
				sources.push({ timeline, iterator, nextItem: iterator.next() });
			}

			this._visibleItemCount = hasAnyItems ? 1 : 0;

			function getNextMostRecentSource() {
				return sources
					.filter(source => !source.nextItem.done)
					.reduce((previous, current) => (previous === undefined || current.nextItem.value!.timestamp >= previous.nextItem.value!.timestamp) ? current : previous, undefined!);
			}

			let lastRelativeTime: string | undefined;
			let nextSource;
			while (nextSource = getNextMostRecentSource()) {
				nextSource.timeline.lastRenderedIndex++;

				const item = nextSource.nextItem.value!;
				item.relativeTime = undefined;
				item.hideRelativeTime = undefined;

				if (item.timestamp >= mostRecentEnd) {
					count++;
					if (count > maxCount) {
						more = true;
						break;
					}

					lastRelativeTime = updateRelativeTime(item, lastRelativeTime);
					yield { element: item };
				}

				nextSource.nextItem = nextSource.iterator.next();
			}
		}

		this._visibleItemCount = count;
		if (count > 0) {
			if (more) {
				yield {
					element: new LoadMoreCommand(this.pendingRequests.size !== 0)
				};
			} else if (this.pendingRequests.size !== 0) {
				yield {
					element: new LoadMoreCommand(true)
				};
			}
		}
	}

	private refresh() {
		if (!this.isBodyVisible()) {
			return;
		}

		this.tree.setChildren(null, this.getItems());
		this._isEmpty = !this.hasVisibleItems;

		if (this.uri === undefined) {
			this.updateFilename(undefined);
			this.message = localize('timeline.editorCannotProvideTimeline', "The active editor cannot provide timeline information.");
		} else if (this._isEmpty) {
			if (this.pendingRequests.size !== 0) {
				this.setLoadingUriMessage();
			} else {
				this.updateFilename(this.labelService.getUriBasenameLabel(this.uri));
				const scmProviderCount = this.contextKeyService.getContextKeyValue<number>('scm.providerCount');
				if (this.timelineService.getSources().filter(({ id }) => !this.excludedSources.has(id)).length === 0) {
					this.message = localize('timeline.noTimelineSourcesEnabled', "All timeline sources have been filtered out.");
				} else {
					if (this.configurationService.getValue('workbench.localHistory.enabled') && !this.excludedSources.has('timeline.localHistory')) {
						this.message = localize('timeline.noLocalHistoryYet', "Local History will track recent changes as you save them unless the file has been excluded or is too large.");
					} else if (this.excludedSources.size > 0) {
						this.message = localize('timeline.noTimelineInfoFromEnabledSources', "No filtered timeline information was provided.");
					} else {
						this.message = localize('timeline.noTimelineInfo', "No timeline information was provided.");
					}
				}
				if (!scmProviderCount || scmProviderCount === 0) {
					this.message += ' ' + localize('timeline.noSCM', "Source Control has not been configured.");
				}
			}
		} else {
			this.updateFilename(this.labelService.getUriBasenameLabel(this.uri));
			this.message = undefined;
		}

		this._pendingRefresh = false;
	}

	@debounce(500)
	private refreshDebounced() {
		this.refresh();
	}

	override focus(): void {
		super.focus();
		this.tree.domFocus();
	}

	override setExpanded(expanded: boolean): boolean {
		const changed = super.setExpanded(expanded);

		if (changed && this.isBodyVisible()) {
			if (!this.followActiveEditor) {
				this.setUriCore(this.uri, true);
			} else {
				this.onActiveEditorChanged();
			}
		}

		return changed;
	}

	override setVisible(visible: boolean): void {
		if (visible) {
			this.extensionService.activateByEvent('onView:timeline');
			this.visibilityDisposables = new DisposableStore();

			this.editorService.onDidActiveEditorChange(this.onActiveEditorChanged, this, this.visibilityDisposables);
			// Refresh the view on focus to update the relative timestamps
			this.onDidFocus(() => this.refreshDebounced(), this, this.visibilityDisposables);

			super.setVisible(visible);

			this.onActiveEditorChanged();
		} else {
			this.visibilityDisposables?.dispose();

			super.setVisible(visible);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree.layout(height, width);
	}

	protected override renderHeaderTitle(container: HTMLElement): void {
		super.renderHeaderTitle(container, this.title);

		container.classList.add('timeline-view');
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.$container = container;
		container.classList.add('tree-explorer-viewlet-tree-view', 'timeline-tree-view');

		this.$message = DOM.append(this.$container, DOM.$('.message'));
		this.$message.classList.add('timeline-subtle');

		this.message = localize('timeline.editorCannotProvideTimeline', "The active editor cannot provide timeline information.");

		this.$tree = document.createElement('div');
		this.$tree.classList.add('customview-tree', 'file-icon-themable-tree', 'hide-arrows');
		// this.treeElement.classList.add('show-file-icons');
		container.appendChild(this.$tree);

		this.treeRenderer = this.instantiationService.createInstance(TimelineTreeRenderer, this.commands, this.viewDescriptorService.getViewLocationById(this.id));
		this._register(this.treeRenderer.onDidScrollToEnd(item => {
			if (this.pageOnScroll) {
				this.loadMore(item);
			}
		}));

		this.tree = this.instantiationService.createInstance(WorkbenchObjectTree<TreeElement, FuzzyScore>, 'TimelinePane',
			this.$tree, new TimelineListVirtualDelegate(), [this.treeRenderer], {
			identityProvider: new TimelineIdentityProvider(),
			accessibilityProvider: {
				getAriaLabel(element: TreeElement): string {
					if (isLoadMoreCommand(element)) {
						return element.ariaLabel;
					}
					return element.accessibilityInformation ? element.accessibilityInformation.label : localize('timeline.aria.item', "{0}: {1}", element.relativeTimeFullWord ?? '', element.label);
				},
				getRole(element: TreeElement): AriaRole {
					if (isLoadMoreCommand(element)) {
						return 'treeitem';
					}
					return element.accessibilityInformation && element.accessibilityInformation.role ? element.accessibilityInformation.role : 'treeitem';
				},
				getWidgetAriaLabel(): string {
					return localize('timeline', "Timeline");
				}
			},
			keyboardNavigationLabelProvider: new TimelineKeyboardNavigationLabelProvider(),
			multipleSelectionSupport: false,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
		});

		TimelineViewFocusedContext.bindTo(this.tree.contextKeyService);

		this._register(this.tree.onContextMenu(e => this.onContextMenu(this.commands, e)));
		this._register(this.tree.onDidChangeSelection(e => this.ensureValidItems()));
		this._register(this.tree.onDidOpen(e => {
			if (!e.browserEvent || !this.ensureValidItems()) {
				return;
			}

			const selection = this.tree.getSelection();
			let item;
			if (selection.length === 1) {
				item = selection[0];
			}

			if (item === null) {
				return;
			}

			if (isTimelineItem(item)) {
				if (item.command) {
					let args = item.command.arguments ?? [];
					if (item.command.id === API_OPEN_EDITOR_COMMAND_ID || item.command.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
						// Some commands owned by us should receive the
						// `IOpenEvent` as context to open properly
						args = [...args, e];
					}

					this.commandService.executeCommand(item.command.id, ...args);
				}
			}
			else if (isLoadMoreCommand(item)) {
				this.loadMore(item);
			}
		}));
	}

	private loadMore(item: LoadMoreCommand) {
		if (item.loading) {
			return;
		}

		item.loading = true;
		this.tree.rerender(item);

		if (this.pendingRequests.size !== 0) {
			return;
		}

		this._maxItemCount = this._visibleItemCount + this.pageSize;
		this.loadTimeline(false);
	}

	ensureValidItems() {
		// If we don't have any non-excluded timelines, clear the tree and show the loading message
		if (!this.hasVisibleItems || !this.timelineService.getSources().some(({ id }) => !this.excludedSources.has(id) && this.timelinesBySource.has(id))) {
			this.tree.setChildren(null, undefined);
			this._isEmpty = true;

			this.setLoadingUriMessage();

			return false;
		}

		return true;
	}

	setLoadingUriMessage() {
		const file = this.uri && this.labelService.getUriBasenameLabel(this.uri);
		this.updateFilename(file);
		this.message = file ? localize('timeline.loading', "Loading timeline for {0}...", file) : '';
	}

	private onContextMenu(commands: TimelinePaneCommands, treeEvent: ITreeContextMenuEvent<TreeElement | null>): void {
		const item = treeEvent.element;
		if (item === null) {
			return;
		}
		const event: UIEvent = treeEvent.browserEvent;

		event.preventDefault();
		event.stopPropagation();

		if (!this.ensureValidItems()) {
			return;
		}

		this.tree.setFocus([item]);
		const actions = commands.getItemContextActions(item);
		if (!actions.length) {
			return;
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => treeEvent.anchor,
			getActions: () => actions,
			getActionViewItem: (action) => {
				const keybinding = this.keybindingService.lookupKeybinding(action.id);
				if (keybinding) {
					return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
				}
				return undefined;
			},
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					this.tree.domFocus();
				}
			},
			getActionsContext: (): TimelineActionContext => ({ uri: this.uri, item }),
			actionRunner: new TimelineActionRunner()
		});
	}
}

class TimelineElementTemplate implements IDisposable {
	static readonly id = 'TimelineElementTemplate';

	readonly actionBar: ActionBar;
	readonly icon: HTMLElement;
	readonly iconLabel: IconLabel;
	readonly timestamp: HTMLSpanElement;

	constructor(
		container: HTMLElement,
		actionViewItemProvider: IActionViewItemProvider,
		hoverDelegate: IHoverDelegate,
	) {
		container.classList.add('custom-view-tree-node-item');
		this.icon = DOM.append(container, DOM.$('.custom-view-tree-node-item-icon'));

		this.iconLabel = new IconLabel(container, { supportHighlights: true, supportIcons: true, hoverDelegate });

		const timestampContainer = DOM.append(this.iconLabel.element, DOM.$('.timeline-timestamp-container'));
		this.timestamp = DOM.append(timestampContainer, DOM.$('span.timeline-timestamp'));

		const actionsContainer = DOM.append(this.iconLabel.element, DOM.$('.actions'));
		this.actionBar = new ActionBar(actionsContainer, { actionViewItemProvider });
	}

	dispose() {
		this.iconLabel.dispose();
		this.actionBar.dispose();
	}

	reset() {
		this.icon.className = '';
		this.icon.style.backgroundImage = '';
		this.actionBar.clear();
	}
}

export class TimelineIdentityProvider implements IIdentityProvider<TreeElement> {
	getId(item: TreeElement): { toString(): string } {
		return item.handle;
	}
}

class TimelineActionRunner extends ActionRunner {

	protected override async runAction(action: IAction, { uri, item }: TimelineActionContext): Promise<void> {
		if (!isTimelineItem(item)) {
			// TODO@eamodio do we need to do anything else?
			await action.run();
			return;
		}

		await action.run(
			{
				$mid: MarshalledId.TimelineActionContext,
				handle: item.handle,
				source: item.source,
				uri
			},
			uri,
			item.source,
		);
	}
}

export class TimelineKeyboardNavigationLabelProvider implements IKeyboardNavigationLabelProvider<TreeElement> {
	getKeyboardNavigationLabel(element: TreeElement): { toString(): string } {
		return element.label;
	}
}

export class TimelineListVirtualDelegate implements IListVirtualDelegate<TreeElement> {
	getHeight(_element: TreeElement): number {
		return ItemHeight;
	}

	getTemplateId(element: TreeElement): string {
		return TimelineElementTemplate.id;
	}
}

class TimelineTreeRenderer implements ITreeRenderer<TreeElement, FuzzyScore, TimelineElementTemplate> {
	private readonly _onDidScrollToEnd = new Emitter<LoadMoreCommand>();
	readonly onDidScrollToEnd: Event<LoadMoreCommand> = this._onDidScrollToEnd.event;

	readonly templateId: string = TimelineElementTemplate.id;

	private _hoverDelegate: IHoverDelegate;

	private actionViewItemProvider: IActionViewItemProvider;

	constructor(
		private readonly commands: TimelinePaneCommands,
		private readonly viewContainerLocation: ViewContainerLocation | null,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService
	) {
		this.actionViewItemProvider = createActionViewItem.bind(undefined, this.instantiationService);

		this._hoverDelegate = this.instantiationService.createInstance(
			WorkbenchHoverDelegate,
			this.viewContainerLocation === ViewContainerLocation.Panel ? 'mouse' : 'element',
			{
				instantHover: this.viewContainerLocation !== ViewContainerLocation.Panel
			}, {
			position: {
				hoverPosition: HoverPosition.RIGHT // Will flip when there's no space
			}
		});
	}

	private uri: URI | undefined;
	setUri(uri: URI | undefined) {
		this.uri = uri;
	}

	renderTemplate(container: HTMLElement): TimelineElementTemplate {
		return new TimelineElementTemplate(container, this.actionViewItemProvider, this._hoverDelegate);
	}

	renderElement(
		node: ITreeNode<TreeElement, FuzzyScore>,
		index: number,
		template: TimelineElementTemplate
	): void {
		template.reset();

		const { element: item } = node;

		const theme = this.themeService.getColorTheme();
		const icon = isDark(theme.type) ? item.iconDark : item.icon;
		const iconUrl = icon ? URI.revive(icon) : null;

		if (iconUrl) {
			template.icon.className = 'custom-view-tree-node-item-icon';
			template.icon.style.backgroundImage = css.asCSSUrl(iconUrl);
			template.icon.style.color = '';
		} else if (item.themeIcon) {
			template.icon.className = `custom-view-tree-node-item-icon ${ThemeIcon.asClassName(item.themeIcon)}`;
			if (item.themeIcon.color) {
				template.icon.style.color = theme.getColor(item.themeIcon.color.id)?.toString() ?? '';
			} else {
				template.icon.style.color = '';
			}
			template.icon.style.backgroundImage = '';
		} else {
			template.icon.className = 'custom-view-tree-node-item-icon';
			template.icon.style.backgroundImage = '';
			template.icon.style.color = '';
		}
		const tooltip = item.tooltip
			? isString(item.tooltip)
				? item.tooltip
				: { markdown: item.tooltip, markdownNotSupportedFallback: renderAsPlaintext(item.tooltip) }
			: undefined;

		template.iconLabel.setLabel(item.label, item.description, {
			title: tooltip,
			matches: createMatches(node.filterData)
		});

		template.timestamp.textContent = item.relativeTime ?? '';
		template.timestamp.ariaLabel = item.relativeTimeFullWord ?? '';
		template.timestamp.parentElement!.classList.toggle('timeline-timestamp--duplicate', isTimelineItem(item) && item.hideRelativeTime);

		template.actionBar.context = { uri: this.uri, item } satisfies TimelineActionContext;
		template.actionBar.actionRunner = new TimelineActionRunner();
		template.actionBar.push(this.commands.getItemActions(item), { icon: true, label: false });

		// If we are rendering the load more item, we've scrolled to the end, so trigger an event
		if (isLoadMoreCommand(item)) {
			setTimeout(() => this._onDidScrollToEnd.fire(item), 0);
		}
	}

	disposeElement(element: ITreeNode<TreeElement, FuzzyScore>, index: number, templateData: TimelineElementTemplate): void {
		templateData.actionBar.actionRunner.dispose();
	}

	disposeTemplate(template: TimelineElementTemplate): void {
		template.dispose();
	}
}


const timelineRefresh = registerIcon('timeline-refresh', Codicon.refresh, localize('timelineRefresh', 'Icon for the refresh timeline action.'));
const timelinePin = registerIcon('timeline-pin', Codicon.pin, localize('timelinePin', 'Icon for the pin timeline action.'));
const timelineUnpin = registerIcon('timeline-unpin', Codicon.pinned, localize('timelineUnpin', 'Icon for the unpin timeline action.'));

class TimelinePaneCommands extends Disposable {
	private readonly sourceDisposables: DisposableStore;

	constructor(
		private readonly pane: TimelinePane,
		@ITimelineService private readonly timelineService: ITimelineService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
	) {
		super();

		this._register(this.sourceDisposables = new DisposableStore());

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'timeline.refresh',
					title: localize2('refresh', "Refresh"),
					icon: timelineRefresh,
					category: localize2('timeline', "Timeline"),
					menu: {
						id: MenuId.TimelineTitle,
						group: 'navigation',
						order: 99,
					}
				});
			}
			run(accessor: ServicesAccessor, ...args: unknown[]) {
				pane.reset();
			}
		}));

		this._register(CommandsRegistry.registerCommand('timeline.toggleFollowActiveEditor',
			(accessor: ServicesAccessor, ...args: unknown[]) => pane.followActiveEditor = !pane.followActiveEditor
		));

		this._register(MenuRegistry.appendMenuItem(MenuId.TimelineTitle, ({
			command: {
				id: 'timeline.toggleFollowActiveEditor',
				title: localize2('timeline.toggleFollowActiveEditorCommand.follow', 'Pin the Current Timeline'),
				icon: timelinePin,
				category: localize2('timeline', "Timeline"),
			},
			group: 'navigation',
			order: 98,
			when: TimelineFollowActiveEditorContext
		})));

		this._register(MenuRegistry.appendMenuItem(MenuId.TimelineTitle, ({
			command: {
				id: 'timeline.toggleFollowActiveEditor',
				title: localize2('timeline.toggleFollowActiveEditorCommand.unfollow', 'Unpin the Current Timeline'),
				icon: timelineUnpin,
				category: localize2('timeline', "Timeline"),
			},
			group: 'navigation',
			order: 98,
			when: TimelineFollowActiveEditorContext.toNegated()
		})));

		this._register(timelineService.onDidChangeProviders(() => this.updateTimelineSourceFilters()));
		this.updateTimelineSourceFilters();
	}

	getItemActions(element: TreeElement): IAction[] {
		return this.getActions(MenuId.TimelineItemContext, { key: 'timelineItem', value: element.contextValue }).primary;
	}

	getItemContextActions(element: TreeElement): IAction[] {
		return this.getActions(MenuId.TimelineItemContext, { key: 'timelineItem', value: element.contextValue }).secondary;
	}

	private getActions(menuId: MenuId, context: { key: string; value?: string }): { primary: IAction[]; secondary: IAction[] } {
		const contextKeyService = this.contextKeyService.createOverlay([
			['view', this.pane.id],
			[context.key, context.value],
		]);

		const menu = this.menuService.getMenuActions(menuId, contextKeyService, { shouldForwardArgs: true });
		return getContextMenuActions(menu, 'inline');
	}

	private updateTimelineSourceFilters() {
		this.sourceDisposables.clear();

		const excluded = new Set(JSON.parse(this.storageService.get('timeline.excludeSources', StorageScope.PROFILE, '[]')));
		for (const source of this.timelineService.getSources()) {
			this.sourceDisposables.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: `timeline.toggleExcludeSource:${source.id}`,
						title: source.label,
						menu: {
							id: MenuId.TimelineFilterSubMenu,
							group: 'navigation',
						},
						toggled: ContextKeyExpr.regex(`timelineExcludeSources`, new RegExp(`\\b${escapeRegExpCharacters(source.id)}\\b`)).negate()
					});
				}
				run(accessor: ServicesAccessor, ...args: unknown[]) {
					if (!excluded.delete(source.id)) {
						excluded.add(source.id);
					}

					const storageService = accessor.get(IStorageService);
					storageService.store('timeline.excludeSources', JSON.stringify([...excluded.keys()]), StorageScope.PROFILE, StorageTarget.USER);
				}
			}));
		}
	}
}
