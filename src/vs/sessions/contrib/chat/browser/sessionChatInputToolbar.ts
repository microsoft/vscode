/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, DisposableResizeObserver, EventType, getWindow } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { toAction, Action, Separator, type IAction } from '../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatResponseFileChangesService } from '../../../../workbench/contrib/chat/browser/chatResponseFileChangesService.js';
import { CHAT_TURN_ARTIFACT_PILL_ID, CHAT_TURN_CHANGES_PILL_ID, ChatTurnPillsProvider, diffStatsEqual, EMPTY_DIFF_STATS, IChatTurnPillsModel, IDiffStats, observeTurnStatusPillsEnabled } from '../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { SessionArtifacts, sessionArtifactLocation, sessionReferencesPillOptions, SESSION_REFERENCES_PILL_ID } from './sessionArtifacts.js';
import { chatCustomizationPillOptions, SessionCustomizations, SESSION_CUSTOMIZATIONS_PILL_ID } from './sessionCustomizations.js';
import { localize } from '../../../../nls.js';
import { getChatPillEntries, ChatPillsWidget, IChatPill, IChatPillsModel, type IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { createChatSectionPill, type IChatDropdownPillOptions } from '../../../../workbench/browser/chatDropdownPill.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../../changes/common/changes.js';
import { OPEN_ISSUE_ACTION_ID, OPEN_PULL_REQUEST_ACTION_ID } from '../../github/common/types.js';
import { getSessionChatPillMenu, SessionChatPillKind, SessionChatPillVisibility, type ISessionChatPillMenuEntry } from '../common/sessionChatPills.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionBackgroundActivitiesControl, sessionSubagentsPillOptions } from './sessionBackgroundActivitiesControl.js';
import { SessionBrowsersControl, sessionBrowsersPillOptions } from './sessionBrowsersControl.js';
import type { ISessionChatPillsDebugData } from './sessionChatInputToolbarDebug.js';
import { SessionMetadataPills } from './sessionMetadataPills.js';
import { SessionActivatingActionRunner } from '../../../browser/sessionActionRunner.js';
import './media/sessionChatInputToolbar.css';

/** Diff stats for the current turn, from the chat''s last-turn changes. */
function computeTurnStats(chat: IChat, reader: IReader): IDiffStats {
	let files = 0, insertions = 0, deletions = 0;
	for (const change of chat.lastTurnChanges?.read(reader) ?? []) {
		if (change.isOutsideWorkspace) {
			continue;
		}
		files++;
		insertions += change.insertions;
		deletions += change.deletions;
	}
	return { files, insertions, deletions };
}
/** Fake artifacts for the pill debug overlay. */
function buildDebugArtifactSections(debugData: ISessionChatPillsDebugData): readonly IChatPillSection[] {
	const entries = debugData.markdownFiles.map(name => {
		const resource = URI.from({ scheme: 'session-chat-pills-debug', path: `/${name}` });
		return { id: name, label: name, resource, ...sessionArtifactLocation(resource, name), open: () => { } };
	});
	return entries.length ? [{ title: localize('sessionArtifacts.files', "Files"), entries }] : [];
}

/** Action ids of the pills the sessions toolbar hosts itself. */
export const SESSION_BROWSERS_PILL_ID = 'sessions.chatPills.browsers';
export const SESSION_SUBAGENTS_PILL_ID = 'sessions.chatPills.subagents';

/** The pill kind a contributed or turn-status action belongs to, if any. */
export function getSessionChatPillKindForAction(actionId: string): SessionChatPillKind | undefined {
	switch (actionId) {
		case CHAT_TURN_CHANGES_PILL_ID:
		case VIEW_SESSION_CHANGES_COMMAND_ID:
			return SessionChatPillKind.Changes;
		case CHAT_TURN_ARTIFACT_PILL_ID:
			return SessionChatPillKind.Artifacts;
		case SESSION_REFERENCES_PILL_ID:
			return SessionChatPillKind.References;
		case SESSION_CUSTOMIZATIONS_PILL_ID:
			return SessionChatPillKind.Customizations;
		case OPEN_PULL_REQUEST_ACTION_ID:
			return SessionChatPillKind.PullRequests;
		case OPEN_ISSUE_ACTION_ID:
			return SessionChatPillKind.Issues;
		case SESSION_BROWSERS_PILL_ID:
			return SessionChatPillKind.Browsers;
		case SESSION_SUBAGENTS_PILL_ID:
			return SessionChatPillKind.Subagents;
		default:
			return undefined;
	}
}

/**
 * The row's rendered height, reserved below the transcript by its host because
 * the row floats over it. Derived from the row's `2px`/`6px` padding here plus a
 * 22px `.monaco-text-button.small` pill; keep in sync if either changes.
 */
export const SESSION_CHAT_INPUT_TOOLBAR_HEIGHT = 30;

/** A toolbar for session metadata, active-turn status, and background activity. */
export class SessionChatInputToolbar extends Disposable {

	readonly element: HTMLElement;
	private readonly _content: HTMLElement;
	private readonly _scrollable: DomScrollableElement;
	private readonly _onDidChangeChatPetPlatform = this._register(new Emitter<void>());
	readonly onDidChangeChatPetPlatform: Event<void> = this._onDidChangeChatPetPlatform.event;
	private readonly _pills: ChatPillsWidget;

	/** Sentinel distinguishing "no override" from an explicit `undefined` session. */
	private readonly _sessionOverride = observableValue<IActiveSession | undefined | 'unset'>(this, 'unset');
	/** The chat whose last-turn changes are reflected. */
	private readonly _chat = observableValue<IChat | undefined>(this, undefined);
	private readonly _debugData = observableValue<ISessionChatPillsDebugData | undefined>(this, undefined);
	private readonly _browsers: SessionBrowsersControl;
	private readonly _backgroundActivities: SessionBackgroundActivitiesControl;

	/** The session that owns the reflected chat, from an explicit override or resolved from the chat. */
	private readonly _session: IObservable<IActiveSession | undefined> = derived(reader => {
		const override = this._sessionOverride.read(reader);
		if (override !== 'unset') {
			return override;
		}
		const chat = this._chat.read(reader);
		if (!chat) {
			return undefined;
		}
		return this._findOwningSession(chat.resource, reader);
	});

	/** The current turn's diff stats. */
	private readonly _diffStats: IObservable<IDiffStats>;
	/** Artifact sections shown in the artifact pill. */
	private readonly _artifactSections: IObservable<readonly IChatPillSection[]>;
	/** Reference sections shown in the references pill. */
	private readonly _referenceSections: IObservable<readonly IChatPillSection[]>;
	/** Customization sections shown in the customizations pill. */
	private readonly _customizationSections: IObservable<readonly IChatPillSection[]>;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IChatResponseFileChangesService private readonly _chatResponseFileChangesService: IChatResponseFileChangesService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._content = $('.session-chat-input-toolbar-content');
		this._scrollable = this._register(new DomScrollableElement(this._content, {
			horizontal: ScrollbarVisibility.Auto,
			horizontalScrollbarSize: 6,
			scrollYToX: true,
			vertical: ScrollbarVisibility.Hidden,
		}));
		this.element = this._scrollable.getDomNode();
		this.element.classList.add('session-chat-input-toolbar', 'hidden');

		this._diffStats = derivedOpts<IDiffStats>({ owner: this, equalsFn: diffStatsEqual }, reader => {
			const debugData = this._debugData.read(reader);
			if (debugData) {
				return debugData.stats;
			}
			const chat = this._chat.read(reader);
			return chat ? computeTurnStats(chat, reader) : EMPTY_DIFF_STATS;
		});

		const turnStatusPillsEnabled = observeTurnStatusPillsEnabled(this._configurationService);
		const visibility = this._register(instantiationService.createInstance(SessionChatPillVisibility));
		this._browsers = this._register(instantiationService.createInstance(SessionBrowsersControl, this._session, this._chat, turnStatusPillsEnabled, derived(reader => visibility.isVisible(SessionChatPillKind.Browsers, reader))));

		// The browsers pill already offers the pages it lists, so the artifacts and
		// references pills leave those websites out.
		const sessionArtifacts = this._register(instantiationService.createInstance(SessionArtifacts, this._session, this._browsers.urls));
		this._artifactSections = derived(this, reader => {
			const debugData = this._debugData.read(reader);
			return debugData ? buildDebugArtifactSections(debugData) : sessionArtifacts.sections.read(reader);
		});
		this._referenceSections = sessionArtifacts.referenceSections;
		const sessionCustomizations = this._register(instantiationService.createInstance(SessionCustomizations, this._chat, this._session));
		this._customizationSections = sessionCustomizations.sections;

		const pillsEnabled = derived(reader => this._debugData.read(reader) !== undefined || turnStatusPillsEnabled.read(reader));
		const model: IChatTurnPillsModel = {
			stats: this._diffStats,
			artifacts: this._artifactSections,
			changesEnabled: pillsEnabled,
			artifactsEnabled: pillsEnabled,
			openChanges: () => this._debugData.get() ? undefined : this._openChanges(),
		};

		const turnPills = this._register(instantiationService.createInstance(ChatTurnPillsProvider, model));
		const metadataPills = this._register(instantiationService.createInstance(SessionMetadataPills, this.element, this._session));

		// Every pill the session currently has data for, before the user's
		// per-kind visibility choices are applied.
		const candidatePills = derived<readonly IChatPill[]>(reader => {
			const turn = turnPills.pills.read(reader);
			return [
				...metadataPills.pills.read(reader),
				...turn.filter(pill => pill.action.id !== CHAT_TURN_CHANGES_PILL_ID),
			];
		});
		this._backgroundActivities = this._register(instantiationService.createInstance(SessionBackgroundActivitiesControl, this._session, this._chat, turnStatusPillsEnabled, derived(reader => visibility.isVisible(SessionChatPillKind.Subagents, reader))));

		// `show-file-icons` lets a resource pill paint its themed file icon.
		const resourceLabels = this._register(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const sectionPill = (id: string, label: string, sections: IObservable<readonly IChatPillSection[]>, options: IChatDropdownPillOptions) => {
			const action = this._register(new Action(id, label));
			return createChatSectionPill(action, sections, options, resourceLabels, instantiationService);
		};

		// Customization and reference sections are not gated at the source, so gate
		// them here the way the two activity controls gate their own. Data presence
		// follows the feature gate but not the user's visibility choice, otherwise
		// hiding the pill would drop it from the menu that restores it.
		const gated = (kind: SessionChatPillKind, source: IObservable<readonly IChatPillSection[]>) => {
			const available = derived(reader => turnStatusPillsEnabled.read(reader) ? source.read(reader) : []);
			return {
				hasData: derived(reader => getChatPillEntries(available.read(reader)).length > 0),
				sections: derived(reader => visibility.isVisible(kind, reader) ? available.read(reader) : []),
			};
		};
		const customizations = gated(SessionChatPillKind.Customizations, this._customizationSections);
		const references = gated(SessionChatPillKind.References, this._referenceSections);

		// Every section-backed pill lives in the same toolbar, so the whole row is
		// one tab stop with arrow-key navigation instead of one stop per pill.
		// These follow the candidate pills, which is what puts References directly
		// after the artifacts pill: the two read as a pair, what the session made
		// and what it points at.
		const sectionPills: readonly { readonly pill: IObservable<IChatPill>; readonly sections: IObservable<readonly IChatPillSection[]> }[] = [
			{ pill: sectionPill(SESSION_REFERENCES_PILL_ID, localize('sessionChatPills.references', "References"), references.sections, sessionReferencesPillOptions), sections: references.sections },
			{ pill: sectionPill(SESSION_CUSTOMIZATIONS_PILL_ID, localize('sessionChatPills.customizations', "Customizations"), customizations.sections, chatCustomizationPillOptions), sections: customizations.sections },
			{ pill: sectionPill(SESSION_BROWSERS_PILL_ID, localize('sessionChatPills.browsers', "Browsers"), this._browsers.sections, sessionBrowsersPillOptions), sections: this._browsers.sections },
			{ pill: sectionPill(SESSION_SUBAGENTS_PILL_ID, localize('sessionChatPills.subagents', "Subagents"), this._backgroundActivities.sections, sessionSubagentsPillOptions), sections: this._backgroundActivities.sections },
		];

		const pillsModel: IChatPillsModel = {
			pills: derived(reader => [
				...candidatePills.read(reader).filter(pill => {
					const kind = getSessionChatPillKindForAction(pill.action.id);
					return !kind || visibility.isVisible(kind, reader);
				}),
				...sectionPills
					.filter(entry => getChatPillEntries(entry.sections.read(reader)).length > 0)
					.map(entry => entry.pill.read(reader)),
			]),
			context: this._session,
		};
		const actionRunner = this._register(new SessionActivatingActionRunner(() => this._session.get(), this._sessionsService));
		const pills = this._pills = this._register(instantiationService.createInstance(ChatPillsWidget, pillsModel, {
			actionRunner,
			// The row's visibility menu must be reachable by right-clicking a pill,
			// not just the empty space beside it.
			allowContextMenu: true,
		}));
		pills.element.classList.add('show-file-icons');
		this._content.appendChild(pills.element);
		this._register(pills.onDidChangePills(() => this._onDidChangeChatPetPlatform.fire()));

		// Kinds the session reports data for; the others are listed in a separate group.
		const kindsWithData = derived(reader => {
			const kinds = new Set<SessionChatPillKind>();
			for (const pill of candidatePills.read(reader)) {
				const kind = getSessionChatPillKindForAction(pill.action.id);
				if (kind) {
					kinds.add(kind);
				}
			}
			if (this._browsers.hasData.read(reader)) {
				kinds.add(SessionChatPillKind.Browsers);
			}
			if (this._backgroundActivities.hasData.read(reader)) {
				kinds.add(SessionChatPillKind.Subagents);
			}
			if (customizations.hasData.read(reader)) {
				kinds.add(SessionChatPillKind.Customizations);
			}
			if (references.hasData.read(reader)) {
				kinds.add(SessionChatPillKind.References);
			}
			return kinds;
		});
		this._register(addDisposableListener(this._content, EventType.CONTEXT_MENU, (e: MouseEvent) => {
			// The row owns its context menu, so never fall through to a native one.
			e.preventDefault();
			e.stopPropagation();

			const kinds = kindsWithData.get();
			if (kinds.size === 0) {
				return;
			}

			const anchor = new StandardMouseEvent(getWindow(this._content), e);
			const targetPill = pills.getPill(e.target as HTMLElement | null);
			const targetKind = targetPill ? getSessionChatPillKindForAction(targetPill.action.id) : undefined;
			this._contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => {
					const menu = getSessionChatPillMenu(kinds, visibility.readHiddenKinds(undefined), targetKind);
					const toggleAction = (entry: ISessionChatPillMenuEntry) => toAction({
						id: `sessions.chatPills.toggle.${entry.kind}`,
						label: entry.label,
						checked: entry.checked,
						run: () => visibility.toggle(entry.kind),
					});

					const groups: IAction[][] = [];
					if (menu.hide) {
						const hide = menu.hide;
						groups.push([toAction({
							id: `sessions.chatPills.hide.${hide.kind}`,
							label: hide.label,
							run: () => visibility.hide(hide.kind),
						})]);
					}
					groups.push(menu.withData.map(toggleAction), menu.withoutData.map(toggleAction));
					return Separator.join(...groups);
				},
			});
		}));

		const resizeObserver = this._register(new DisposableResizeObserver('SessionChatInputToolbar.content', () => {
			this._scrollable.scanDomNode();
			this._onDidChangeChatPetPlatform.fire();
		}));
		this._register(resizeObserver.observe(this._content));
		this._register(resizeObserver.observe(pills.element));
		this._register(this._scrollable.onScroll(e => {
			if (e.scrollLeftChanged) {
				this._onDidChangeChatPetPlatform.fire();
			}
		}));
		this._register(addDisposableListener(this._content, EventType.FOCUS_IN, () => this._scrollable.scanDomNode()));

		this._register(autorun(reader => {
			const anyVisible = pills.isVisible.read(reader);
			// Stay rendered while hidden pills have data: in read-only chats the
			// input part is only kept alive by a non-hidden persistent child.
			const anyHidden = kindsWithData.read(reader).size > 0;
			this.element.classList.toggle('hidden', !anyVisible && !anyHidden);
			// With no pill left to right-click, the row itself has to carry the
			// visibility menu or the hidden pills could never be restored.
			this.element.classList.toggle('empty', !anyVisible);
			this._scrollable.scanDomNode();
		}));
	}

	getChatPetPlatformElements(): readonly HTMLElement[] {
		return this._pills.getPillElements();
	}

	/**
	 * Track the currently-viewed chat; the toolbar reflects that chat's last-turn
	 * changes and status, resolving the owning session for provider gating and the
	 * open-changes action. Clears any explicit {@link setSession} override.
	 */
	setChat(chat: IChat | undefined): void {
		this.setDebugData(undefined);
		this._sessionOverride.set('unset', undefined);
		this._chat.set(chat, undefined);
	}

	/**
	 * Explicitly set the session and chat to reflect, bypassing chat-to-session
	 * resolution. Intended for component fixtures and callers that already hold
	 * both.
	 */
	setSession(session: IActiveSession | undefined, chat: IChat | undefined): void {
		this.setDebugData(undefined);
		this._sessionOverride.set(session, undefined);
		this._chat.set(chat, undefined);
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this._debugData.set(data, undefined);
		this._browsers.setDebugData(data);
		this._backgroundActivities.setDebugData(data);
	}

	getDebugData(): ISessionChatPillsDebugData | undefined {
		return this._debugData.get();
	}

	private _findOwningSession(chatResource: URI, reader: IReader): IActiveSession | undefined {
		for (const session of this._sessionsService.visibleSessions.read(reader)) {
			if (session?.chats.read(reader).some(c => isEqual(c.resource, chatResource))) {
				return session;
			}
		}
		const active = this._sessionsService.activeSession.read(reader);
		return active?.chats.read(reader).some(c => isEqual(c.resource, chatResource)) ? active : undefined;
	}

	private _openChanges(): void {
		const chat = this._chat.get();
		if (!chat) {
			return;
		}

		this._chatResponseFileChangesService.openChangesForRequest(chat.resource, undefined, { isLastTurn: true });
	}

}
