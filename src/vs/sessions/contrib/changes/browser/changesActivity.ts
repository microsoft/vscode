/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesActivity.css';
import { $, append } from '../../../../base/browser/dom.js';
import { IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IReader, ISettableObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuEntryActionViewItemOptions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getChangesStatsFilesLabel } from '../../../../workbench/browser/changesStatsWidget.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { diffStatsEqual, IDiffStats } from '../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { IconBadge } from '../../../../workbench/services/activity/common/activity.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionActivityBarActionViewItem } from '../../../browser/parts/sessionActivityBar.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ISessionActivityBarActivityService } from '../../../services/activity/common/sessionActivityBarActivityService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesStatsCache } from '../../../services/sessions/common/sessionChangesStatsCache.js';
import { computeSessionInputPillStats, readLoadedSessionInputPillStats } from '../../chat/browser/sessionChatInputToolbar.js';
import { NEW_CHANGES_TAB_COMMAND_ID } from '../../editor/browser/addTabActions.js';
import { ISessionChangesService } from './sessionChangesService.js';

/** How many chats' seen changes are remembered; the least recently seen entry is evicted beyond this. */
export const MAX_SEEN_CHANGES_CHATS = 200;

const SEEN_CHANGES_STORAGE_KEY = 'sessions.changesActivity.seenChanges';

const SEEN_CHANGES_PERSIST_DELAY = 1000;

interface IStoredSeenChanges {
	readonly chat: string;
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

/**
 * Remembers, per chat, the changes the user last saw, i.e. the Changes pill stats
 * the last time the chat's session Changes editor was visible. Persisted in global
 * storage so that changes made while a session was not shown, or while the window
 * was closed, are still reported as new.
 */
export class SeenChangesStore extends Disposable {

	/** Insertion ordered, least recently seen first. */
	private readonly entries: ISettableObservable<ReadonlyMap<string, IDiffStats>>;
	private readonly persistScheduler: RunOnceScheduler;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this.entries = observableValue<ReadonlyMap<string, IDiffStats>>(this, this.load());

		// Stats can change many times while the user watches an agent edit, so persisting is batched.
		// Registered before the scheduler, so a pending write is flushed before the scheduler is disposed.
		this._register(toDisposable(() => this.flush()));
		this.persistScheduler = this._register(new RunOnceScheduler(() => this.persist(), SEEN_CHANGES_PERSIST_DELAY));
		this._register(this.storageService.onWillSaveState(() => this.flush()));

		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, SEEN_CHANGES_STORAGE_KEY, this._store)(e => {
			if (e.external) {
				this.entries.set(this.load(), undefined);
			}
		}));
	}

	get(chat: string, reader: IReader | undefined): IDiffStats | undefined {
		return this.entries.read(reader).get(chat);
	}

	set(chat: string, stats: IDiffStats): void {
		const current = this.entries.get();
		const existing = current.get(chat);
		if (existing && diffStatsEqual(existing, stats) && chat === Array.from(current.keys()).at(-1)) {
			return;
		}

		// Re-inserting moves the chat to the end, so eviction drops the least recently seen chat.
		const updated = new Map(current);
		updated.delete(chat);
		updated.set(chat, { files: stats.files, insertions: stats.insertions, deletions: stats.deletions });
		while (updated.size > MAX_SEEN_CHANGES_CHATS) {
			const oldest = updated.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			updated.delete(oldest);
		}

		this.entries.set(updated, undefined);
		this.persistScheduler.schedule();
	}

	private flush(): void {
		if (this.persistScheduler.isScheduled()) {
			this.persistScheduler.cancel();
			this.persist();
		}
	}

	private persist(): void {
		const stored = [...this.entries.get()].map(([chat, stats]) => ({ chat, ...stats } satisfies IStoredSeenChanges));
		this.storageService.store(SEEN_CHANGES_STORAGE_KEY, JSON.stringify(stored), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private load(): ReadonlyMap<string, IDiffStats> {
		const entries = new Map<string, IDiffStats>();
		const raw = this.storageService.get(SEEN_CHANGES_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return entries;
		}
		try {
			const stored: readonly IStoredSeenChanges[] = JSON.parse(raw);
			if (!Array.isArray(stored)) {
				return entries;
			}
			for (const entry of stored.slice(-MAX_SEEN_CHANGES_CHATS)) {
				if (typeof entry?.chat === 'string' && typeof entry.files === 'number' && typeof entry.insertions === 'number' && typeof entry.deletions === 'number') {
					entries.set(entry.chat, { files: entry.files, insertions: entry.insertions, deletions: entry.deletions });
				}
			}
		} catch {
			// Corrupt state starts over; the next resolved stats become the baseline.
			return new Map();
		}
		return entries;
	}
}

/**
 * Whether `stats` are new changes relative to the `seen` changes. A chat that was
 * never seen has no baseline yet, so its first stats are not new, and a chat
 * without changes has nothing to show.
 */
export function hasNewChanges(stats: IDiffStats, seen: IDiffStats | undefined): boolean {
	return stats.files > 0 && seen !== undefined && !diffStatsEqual(stats, seen);
}

/**
 * Badges the Session Activity Bar's Changes entry when the active chat has changes
 * the user has not seen in the Changes editor, and shows the Changes pill stats in
 * the entry's hover.
 *
 * The changes are compared with the Changes pill stats recorded the last time the
 * session's Changes editor was visible. The first stats observed for a chat only
 * record a baseline, so restoring a session or loading its changes late does not
 * badge the entry.
 */
export class ChangesActivityContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.changesActivity';

	constructor(
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionChangesService sessionChangesService: ISessionChangesService,
		@ISessionChangesStatsCache changesStatsCache: ISessionChangesStatsCache,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IStorageService storageService: IStorageService,
		@ISessionActivityBarActivityService activityService: ISessionActivityBarActivityService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// The Session Activity Bar only exists in the desktop layout.
		if (layoutService.agentWorkbenchLayout !== AgentWorkbenchLayout.Desktop) {
			return;
		}

		const seenChanges = this._register(new SeenChangesStore(storageService));
		const visibleEditorPanes = observableFromEvent(this, editorService.onDidVisibleEditorsChange, () => editorService.visibleEditorPanes);
		const mainSidePaneVisible = observableFromEvent(this, Event.any<unknown>(layoutService.onDidChangePartVisibility, layoutService.onDidToggleSidePane), () => layoutService.isSidePaneVisible());

		const active = derived(this, reader => {
			const session = sessionsService.activeSession.read(reader);
			const chat = session?.activeChat.read(reader);
			return session && chat ? { session, chat } : undefined;
		});

		const pillStats = derivedOpts<IDiffStats>({ owner: this, equalsFn: diffStatsEqual }, reader => {
			const value = active.read(reader);
			return computeSessionInputPillStats(value?.session, value?.chat, reader, changesStatsCache);
		});

		const activeChanges = derived(this, reader => {
			const value = active.read(reader);
			const stats = value && readLoadedSessionInputPillStats(value.session, value.chat, reader);
			if (!value || !stats) {
				return undefined;
			}
			// The main window's Changes tab stays a visible editor while the side pane is closed, and can show just its file list in the auxiliary bar while the editor part is hidden.
			const isViewing = visibleEditorPanes.read(reader).some(pane =>
				!!pane.input.resource && isEqual(sessionChangesService.getSessionResource(pane.input.resource), value.session.resource)
				&& (!editorGroupsService.mainPart.getGroup(pane.group.id) || mainSidePaneVisible.read(reader)));
			return { chat: value.chat.resource.toString(), stats, isViewing };
		});

		this._register(autorun(reader => {
			const value = activeChanges.read(reader);
			if (value && (value.isViewing || seenChanges.get(value.chat, undefined) === undefined)) {
				seenChanges.set(value.chat, value.stats);
			}
		}));

		const showBadge = derived(this, reader => {
			const value = activeChanges.read(reader);
			return !!value && !value.isViewing && hasNewChanges(value.stats, seenChanges.get(value.chat, reader));
		});

		const badge = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			badge.value = showBadge.read(reader)
				? activityService.showActivity(NEW_CHANGES_TAB_COMMAND_ID, { badge: new IconBadge(Codicon.circleFilled, () => localize('changesActivity.newChanges', "New changes")) })
				: undefined;
		}));

		this._register(actionViewItemService.register(Menus.SessionActivityBar, NEW_CHANGES_TAB_COMMAND_ID, (action, options, instantiationService) =>
			action instanceof MenuItemAction ? instantiationService.createInstance(ChangesActivityBarActionViewItem, action, options, pillStats) : undefined));
	}
}

/** The Session Activity Bar's Changes entry, whose hover also shows the Changes pill stats. */
class ChangesActivityBarActionViewItem extends SessionActivityBarActionViewItem {

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		private readonly stats: IObservable<IDiffStats>,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ISessionActivityBarActivityService activityService: ISessionActivityBarActivityService,
		@ICommandService commandService: ICommandService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService, activityService, commandService);

		this._register(autorun(reader => {
			this.stats.read(reader);
			this.updateTooltip();
		}));
	}

	protected override getTooltip(): string {
		const title = super.getTooltip();
		const stats = this.stats.get();
		return stats.files > 0
			? localize('changesActivity.titleWithStats', "{0}\n{1}, +{2}, -{3}", title, getChangesStatsFilesLabel(stats.files), stats.insertions, stats.deletions)
			: title;
	}

	protected override getHoverContents(): IManagedHoverContent {
		const stats = this.stats.get();
		if (stats.files === 0) {
			return super.getHoverContents();
		}
		const title = super.getTooltip();
		return {
			element: () => {
				const element = $('.changes-activity-hover');
				append(element, $('.changes-activity-hover-title')).textContent = title;
				const statsElement = append(element, $('.changes-activity-hover-stats'));
				append(statsElement, $('span.changes-stats-files')).textContent = getChangesStatsFilesLabel(stats.files);
				append(statsElement, $('span.changes-stats-added')).textContent = `+${stats.insertions}`;
				append(statsElement, $('span.changes-stats-removed')).textContent = `-${stats.deletions}`;
				return element;
			},
		};
	}
}
