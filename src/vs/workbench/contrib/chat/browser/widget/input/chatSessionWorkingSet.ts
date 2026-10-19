/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, IReader, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { getCodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../../../nls.js';
import { MenuWorkbenchButtonBar } from '../../../../../../platform/actions/browser/buttonbar.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { chatEditingWidgetFileStateContextKey, IChatEditingSession, IEditSessionEntryDiff, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { ChatEditingShowChangesAction } from '../../chatEditing/chatEditingActions.js';
import { getChatFileChangeLineCounts, renderChangesSummaryFileList } from '../chatContentParts/chatChangesSummaryPart.js';

/**
 * Lets the session working set show the changes of the chat's editing session
 * that wait for the user to keep or undo them, apart from the session's
 * cumulative changes.
 */
export interface IChatSessionWorkingSetReview {
	/** The chat's editing session, whose undecided changes can be kept or undone. */
	readonly editingSession: IObservable<IChatEditingSession | undefined>;
	/** The argument that the Keep and Undo toolbar actions run with. */
	getActionArg(sessionResource: URI): unknown;
}

type WorkingSetTab = 'session' | 'review';

const TAB_ORDER: readonly WorkingSetTab[] = ['session', 'review'];

interface IWorkingSetTab {
	readonly element: HTMLElement;
	readonly count: HTMLElement;
	readonly panel: HTMLElement;
}

function toReviewDiff(entry: IModifiedFileEntry, reader: IReader): IEditSessionEntryDiff {
	return {
		originalURI: entry.originalURI,
		modifiedURI: entry.modifiedURI,
		added: entry.linesAdded?.read(reader) ?? 0,
		removed: entry.linesRemoved?.read(reader) ?? 0,
		identical: false,
		quitEarly: false,
		isFinal: true,
		isBusy: false,
	};
}

function getLineCounts(diffs: readonly IEditSessionEntryDiff[]): string {
	return getChatFileChangeLineCounts(
		diffs.reduce((total, diff) => total + diff.added, 0),
		diffs.reduce((total, diff) => total + diff.removed, 0),
	);
}

function describeSessionFiles(count: number): string {
	return count === 1
		? localize('chat.sessionWorkingSet.oneFile', "1 file changed")
		: localize('chat.sessionWorkingSet.manyFiles', "{0} files changed", count);
}

function describeReviewFiles(count: number): string {
	return count === 1
		? localize('chat.sessionWorkingSet.review.oneFile', "1 file to review")
		: localize('chat.sessionWorkingSet.review.manyFiles', "{0} files to review", count);
}

export class ChatSessionWorkingSet extends Disposable {
	readonly domNode = dom.$('.chat-editing-session-container.chat-session-working-set');
	readonly onDidFocus: Event<void>;

	constructor(
		diffs: IObservable<readonly IEditSessionEntryDiff[]>,
		collapsed: ISettableObservable<boolean>,
		review: IChatSessionWorkingSetReview | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.domNode));
		ChatContextKeys.inChatSessionWorkingSet.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		this.onDidFocus = this._register(dom.trackFocus(this.domNode)).onDidFocus;

		const overview = dom.append(this.domNode, dom.$('.chat-editing-session-overview'));
		const title = dom.append(overview, dom.$('.working-set-title'));
		const button = this._register(new ButtonWithIcon(title, { secondary: true, supportIcons: true }));
		const counts = dom.append(button.element, dom.$('.working-set-line-counts', { 'aria-hidden': 'true' }));
		const addedLabel = dom.append(counts, dom.$('.working-set-lines-added'));
		const removedLabel = dom.append(counts, dom.$('.working-set-lines-removed'));
		const sessionList = dom.append(this.domNode, dom.$('.chat-editing-session-list'));

		this._register(renderChangesSummaryFileList(sessionList, diffs, scopedInstantiationService, editorService, configurationService, {
			alwaysOpenInDiffEditor: true,
			ariaLabel: localize('chat.sessionWorkingSet.list', "Session changes"),
		}));
		this._register(button.onDidClick(() => collapsed.set(!collapsed.get(), undefined)));

		const activeTab = review
			? this._renderReviewTabs(review, diffs, collapsed, overview, sessionList, () => button.focus(), scopedContextKeyService, scopedInstantiationService, editorService, configurationService)
			: constObservable(undefined);

		this._register(autorun(reader => {
			const isCollapsed = collapsed.read(reader);
			const hidden = isCollapsed || (activeTab.read(reader) ?? 'session') !== 'session';
			button.icon = isCollapsed ? Codicon.chevronRightCompact : Codicon.chevronDownCompact;
			button.element.setAttribute('aria-expanded', String(!isCollapsed));
			if (hidden && dom.isAncestorOfActiveElement(sessionList)) {
				button.focus();
			}
			sessionList.classList.toggle('collapsed', hidden);
		}));
		this._register(autorun(reader => {
			const changes = diffs.read(reader);
			const files = describeSessionFiles(changes.length);
			button.label = files;
			button.element.setAttribute('aria-label', localize('chat.sessionWorkingSet.summary', "Session changes, {0}, {1}", files, getLineCounts(changes)));
			addedLabel.textContent = `+${changes.reduce((total, diff) => total + diff.added, 0)}`;
			removedLabel.textContent = `-${changes.reduce((total, diff) => total + diff.removed, 0)}`;
		}));
	}

	/**
	 * Renders the changes that wait for the user to keep or undo them, in a
	 * tab next to the session's changes. Undoing reverts the file on disk,
	 * while Session Changes keep recording what the agent did.
	 *
	 * @returns The tab to show, or `undefined` while nothing waits for review.
	 */
	private _renderReviewTabs(
		review: IChatSessionWorkingSetReview,
		sessionDiffs: IObservable<readonly IEditSessionEntryDiff[]>,
		collapsed: ISettableObservable<boolean>,
		overview: HTMLElement,
		sessionList: HTMLElement,
		focusHeading: () => void,
		contextKeyService: IContextKeyService,
		instantiationService: IInstantiationService,
		editorService: IEditorService,
		configurationService: IConfigurationService,
	): IObservable<WorkingSetTab | undefined> {
		const pendingEntries = derived(reader => {
			const session = review.editingSession.read(reader);
			return session?.supportsKeepUndo
				? session.entries.read(reader).filter(entry => entry.state.read(reader) === ModifiedFileEntryState.Modified)
				: [];
		});
		const pendingDiffs = derived(reader => pendingEntries.read(reader).map(entry => toReviewDiff(entry, reader)));
		const findEntry = (uri: URI) => pendingEntries.get().find(entry => isEqual(entry.modifiedURI, uri));

		// Keep and Undo apply to the changes to review, so they show with that tab, where the heading's actions usually are.
		const actionsContainer = dom.append(overview, dom.$('.chat-editing-session-actions'));
		const tablist = dom.$('.working-set-tabs', {
			role: 'tablist',
			'aria-label': localize('chat.sessionWorkingSet.reviewTabs', "Changes"),
		});
		sessionList.before(tablist);
		const emptySession = dom.append(sessionList, dom.$('.working-set-empty', undefined, localize('chat.sessionWorkingSet.noSessionChanges', "No session changes yet.")));
		const reviewList = dom.append(this.domNode, dom.$('.chat-editing-session-list'));
		const id = generateUuid();
		sessionList.id = `${id}-session-panel`;
		reviewList.id = `${id}-review-panel`;
		const tabs: Record<WorkingSetTab, IWorkingSetTab> = {
			session: this._renderTab(tablist, `${id}-session`, Codicon.diffMultiple, localize('chat.sessionWorkingSet.sessionTab', "Session Changes"), sessionList),
			review: this._renderTab(tablist, `${id}-review`, Codicon.codeReview, localize('chat.sessionWorkingSet.reviewTab', "To Review"), reviewList),
		};

		// Every file to review has undecided changes, which the working set of local chat keeps or undoes per file.
		const reviewContextKeyService = this._register(contextKeyService.createScoped(reviewList));
		chatEditingWidgetFileStateContextKey.bindTo(reviewContextKeyService).set(ModifiedFileEntryState.Modified);
		const reviewInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, reviewContextKeyService])));
		this._register(renderChangesSummaryFileList(reviewList, pendingDiffs, reviewInstantiationService, editorService, configurationService, {
			ariaLabel: localize('chat.sessionWorkingSet.review.list', "Changes to review"),
			rowMenu: MenuId.ChatEditingWidgetModifiedFilesToolbar,
			openRow: diff => {
				const entry = findEntry(diff.modifiedURI);
				if (!entry) {
					return false;
				}
				// Review in place, where each change can be kept or undone.
				editorService.openEditor({ resource: entry.modifiedURI }).then(pane => {
					// Other editors, like custom editors, can't show the changes in place.
					if (pane && getCodeEditor(pane.getControl())) {
						entry.getEditorIntegration(pane).reveal(true);
					}
				});
				return true;
			},
		}));

		this._register(autorun(reader => {
			const session = review.editingSession.read(reader);
			if (!session) {
				return;
			}
			reader.store.add(instantiationService.createInstance(MenuWorkbenchButtonBar, actionsContainer, MenuId.ChatEditingWidgetToolbar, {
				telemetrySource: 'chatSessionWorkingSet',
				small: true,
				menuOptions: { arg: review.getActionArg(session.chatSessionResource) },
				buttonConfigProvider: action => action.id === ChatEditingShowChangesAction.ID
					? { showIcon: true, showLabel: false, isSecondary: true }
					: undefined,
			}));
		}));

		const selected = observableValue<WorkingSetTab>(this, 'session');
		let hadPending = false;
		this._register(autorun(reader => {
			const hasPending = pendingDiffs.read(reader).length > 0;
			if (hasPending !== hadPending) {
				hadPending = hasPending;
				// New changes to review come first, unless the user is reading the session's changes.
				selected.set(hasPending && !dom.isAncestorOfActiveElement(sessionList) ? 'review' : 'session', undefined);
			}
		}));
		const activeTab = derived<WorkingSetTab | undefined>(reader => pendingDiffs.read(reader).length > 0 ? selected.read(reader) : undefined);

		const select = (tab: WorkingSetTab) => selected.set(tab, undefined);
		for (const tab of TAB_ORDER) {
			this._register(dom.addDisposableListener(tabs[tab].element, dom.EventType.CLICK, () => select(tab)));
		}
		this._register(dom.addStandardDisposableListener(tablist, dom.EventType.KEY_DOWN, e => {
			const index = TAB_ORDER.indexOf(selected.get());
			const next = e.equals(KeyCode.RightArrow) ? (index + 1) % TAB_ORDER.length
				: e.equals(KeyCode.LeftArrow) ? (index + TAB_ORDER.length - 1) % TAB_ORDER.length
					: e.equals(KeyCode.Home) ? 0
						: e.equals(KeyCode.End) ? TAB_ORDER.length - 1
							: undefined;
			if (next !== undefined) {
				dom.EventHelper.stop(e, true);
				select(TAB_ORDER[next]);
				tabs[TAB_ORDER[next]].element.focus();
			}
		}));

		this._register(autorun(reader => {
			const tab = activeTab.read(reader);
			const isCollapsed = collapsed.read(reader);
			const showTabs = tab !== undefined && !isCollapsed;
			const showReview = showTabs && tab === 'review';
			if ((!showTabs && dom.isAncestorOfActiveElement(tablist))
				|| (!showReview && dom.isAncestorOfActiveElement(reviewList))
				|| (tab !== 'review' && dom.isAncestorOfActiveElement(actionsContainer))) {
				focusHeading();
			}
			dom.setVisibility(showTabs, tablist);
			// Like the heading itself, Keep and Undo stay at hand while the working set is collapsed.
			dom.setVisibility(tab === 'review', actionsContainer);
			dom.setVisibility(tab === 'session' && sessionDiffs.read(reader).length === 0, emptySession);
			reviewList.classList.toggle('collapsed', !showReview);
			for (const name of TAB_ORDER) {
				const { element, panel } = tabs[name];
				const isSelected = name === tab;
				element.classList.toggle('selected', isSelected);
				element.setAttribute('aria-selected', String(isSelected));
				element.tabIndex = isSelected ? 0 : -1;
				// Without tabs, the lists are not tab panels.
				if (tab === undefined) {
					panel.removeAttribute('role');
					panel.removeAttribute('aria-labelledby');
				} else {
					panel.setAttribute('role', 'tabpanel');
					panel.setAttribute('aria-labelledby', element.id);
				}
			}
		}));

		this._register(autorun(reader => {
			const changes = sessionDiffs.read(reader);
			const pending = pendingDiffs.read(reader);
			tabs.session.count.textContent = String(changes.length);
			tabs.review.count.textContent = String(pending.length);
			tabs.session.element.setAttribute('aria-label', localize('chat.sessionWorkingSet.sessionTab.summary', "Session Changes, {0}, {1}", describeSessionFiles(changes.length), getLineCounts(changes)));
			tabs.review.element.setAttribute('aria-label', localize('chat.sessionWorkingSet.reviewTab.summary', "To Review, {0}, {1}", describeReviewFiles(pending.length), getLineCounts(pending)));
		}));

		return activeTab;
	}

	private _renderTab(tablist: HTMLElement, id: string, icon: ThemeIcon, label: string, panel: HTMLElement): IWorkingSetTab {
		const element = dom.append(tablist, dom.$('.working-set-tab', { id, role: 'tab', 'aria-controls': panel.id }));
		dom.append(element, dom.$('span.working-set-tab-icon', { 'aria-hidden': 'true' })).classList.add(...ThemeIcon.asClassNameArray(icon));
		dom.append(element, dom.$('span.working-set-tab-label', undefined, label));
		const count = dom.append(element, dom.$('span.working-set-tab-count', { 'aria-hidden': 'true' }));
		return { element, count, panel };
	}
}
