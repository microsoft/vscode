/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsList.css';
import * as DOM from '../../../../base/browser/dom.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListStyles } from '../../../../base/browser/ui/list/listWidget.js';
import { IObjectTreeElement, ITreeNode, ITreeRenderer, ObjectTreeElementCollapseState } from '../../../../base/browser/ui/tree/tree.js';
import { RenderIndentGuides } from '../../../../base/browser/ui/tree/abstractTree.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { fromNow } from '../../../../base/common/date.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IStyleOverride } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISessionData, SessionStatus } from '../common/sessionData.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';

const $ = DOM.$;

//#region Types

export enum SessionsGrouping {
	Repository = 'repository',
	Date = 'date',
}

export enum SessionsSorting {
	Created = 'created',
	Updated = 'updated',
}

export interface ISessionSection {
	readonly id: string;
	readonly label: string;
	readonly sessions: ISessionData[];
}

export type SessionListItem = ISessionData | ISessionSection;

function isSessionSection(item: SessionListItem): item is ISessionSection {
	return 'sessions' in item && Array.isArray((item as ISessionSection).sessions);
}

//#endregion

//#region Tree Delegate

class SessionsTreeDelegate implements IListVirtualDelegate<SessionListItem> {
	private static readonly ITEM_HEIGHT = 54;
	private static readonly SECTION_HEIGHT = 26;

	getHeight(element: SessionListItem): number {
		return isSessionSection(element) ? SessionsTreeDelegate.SECTION_HEIGHT : SessionsTreeDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: SessionListItem): string {
		return isSessionSection(element) ? SessionSectionRenderer.TEMPLATE_ID : SessionItemRenderer.TEMPLATE_ID;
	}
}

//#endregion

//#region Session Item Renderer

interface ISessionItemTemplate {
	readonly container: HTMLElement;
	readonly iconContainer: HTMLElement;
	readonly title: HTMLElement;
	readonly detailsRow: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class SessionItemRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionItemTemplate> {
	static readonly TEMPLATE_ID = 'session-item';
	readonly templateId = SessionItemRenderer.TEMPLATE_ID;

	constructor(private readonly options: { grouping: () => SessionsGrouping }) { }

	renderTemplate(container: HTMLElement): ISessionItemTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());

		container.classList.add('session-item');

		const iconContainer = DOM.append(container, $('.session-icon'));
		const mainCol = DOM.append(container, $('.session-main'));
		const titleRow = DOM.append(mainCol, $('.session-title-row'));
		const title = DOM.append(titleRow, $('.session-title'));
		const detailsRow = DOM.append(mainCol, $('.session-details-row'));

		return { container, iconContainer, title, detailsRow, disposables, elementDisposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionItemTemplate): void {
		const element = node.element;
		if (isSessionSection(element)) {
			return;
		}
		this.renderSession(element, template);
	}

	private renderSession(element: ISessionData, template: ISessionItemTemplate): void {
		template.elementDisposables.clear();

		// Icon — reactive based on status
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = element.status.read(reader);
			DOM.clearNode(template.iconContainer);
			const icon = this.getStatusIcon(sessionStatus, element.icon);
			DOM.append(template.iconContainer, $(`span${ThemeIcon.asCSSSelector(icon)}`));
			template.iconContainer.classList.toggle('session-icon-pulse', sessionStatus === SessionStatus.NeedsInput);
			template.iconContainer.classList.toggle('session-icon-active', sessionStatus === SessionStatus.InProgress);
		}));

		// Title — reactive
		template.elementDisposables.add(autorun(reader => {
			const titleText = element.title.read(reader);
			template.title.textContent = titleText;
		}));

		// Details row — reactive: badge · diff stats · time
		const timeDisposable = template.elementDisposables.add(new MutableDisposable());
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = element.status.read(reader);
			const changes = element.changes.read(reader);
			const updatedAt = element.updatedAt.read(reader);
			const workspace = element.workspace.read(reader);

			// Clear and rebuild details row
			DOM.clearNode(template.detailsRow);
			const parts: HTMLElement[] = [];

			// Workspace badge — show when not grouped by repository
			if (workspace && this.options.grouping() !== SessionsGrouping.Repository) {
				const badgeEl = DOM.append(template.detailsRow, $('span.session-badge'));
				badgeEl.textContent = workspace.label;
				parts.push(badgeEl);
			}

			// Diff stats
			if (changes.length > 0 && sessionStatus !== SessionStatus.InProgress) {
				let insertions = 0;
				let deletions = 0;
				for (const change of changes) {
					insertions += change.insertions;
					deletions += change.deletions;
				}
				if (insertions > 0 || deletions > 0) {
					if (parts.length > 0) {
						DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
					}
					const diffEl = DOM.append(template.detailsRow, $('span.session-diff'));
					DOM.append(diffEl, $('span.session-diff-added')).textContent = `+${insertions}`;
					DOM.append(diffEl, $('span')).textContent = ' ';
					DOM.append(diffEl, $('span.session-diff-removed')).textContent = `-${deletions}`;
					parts.push(diffEl);
				}
			}

			// Status description or timestamp
			if (sessionStatus === SessionStatus.InProgress) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
				statusEl.textContent = localize('working', "Working...");
			} else if (sessionStatus === SessionStatus.NeedsInput) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
				statusEl.textContent = localize('needsInput', "Input needed");
			} else if (sessionStatus === SessionStatus.Error) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
				statusEl.textContent = localize('failed', "Failed");
			} else {
				// Relative timestamp
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const timeEl = DOM.append(template.detailsRow, $('span.session-time'));
				const formatTime = () => {
					const seconds = Math.round((Date.now() - updatedAt.getTime()) / 1000);
					return seconds < 60 ? localize('secondsDuration', "now") : fromNow(updatedAt, true);
				};
				timeEl.textContent = formatTime();
				const targetWindow = DOM.getWindow(timeEl);
				const interval = targetWindow.setInterval(() => {
					timeEl.textContent = formatTime();
				}, 60_000);
				timeDisposable.value = { dispose: () => targetWindow.clearInterval(interval) };
			}
		}));
	}

	private getStatusIcon(status: SessionStatus, defaultIcon: ThemeIcon): ThemeIcon {
		switch (status) {
			case SessionStatus.InProgress: return Codicon.loading;
			case SessionStatus.NeedsInput: return Codicon.circleFilled;
			case SessionStatus.Error: return Codicon.error;
			default: return defaultIcon;
		}
	}



	disposeElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionItemTemplate): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(template: ISessionItemTemplate): void {
		template.disposables.dispose();
	}
}

//#endregion

//#region Section Header Renderer

interface ISessionSectionTemplate {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	readonly count: HTMLElement;
}

class SessionSectionRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionSectionTemplate> {
	static readonly TEMPLATE_ID = 'session-section';
	readonly templateId = SessionSectionRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ISessionSectionTemplate {
		container.classList.add('session-section');
		const label = DOM.append(container, $('span.session-section-label'));
		const count = DOM.append(container, $('span.session-section-count'));
		return { container, label, count };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionSectionTemplate): void {
		const element = node.element;
		if (!isSessionSection(element)) {
			return;
		}
		template.label.textContent = element.label;
		template.count.textContent = String(element.sessions.length);
	}

	disposeTemplate(_template: ISessionSectionTemplate): void { }
}

//#endregion

//#region Accessibility

class SessionsAccessibilityProvider {
	getWidgetAriaLabel(): string {
		return localize('sessionsList', "Sessions");
	}

	getAriaLabel(element: SessionListItem): string | null {
		if (isSessionSection(element)) {
			return `${element.label}, ${element.sessions.length}`;
		}
		return element.title.get();
	}
}

//#endregion

//#region Sessions List Control

export interface ISessionsListControlOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly grouping: () => SessionsGrouping;
	readonly sorting: () => SessionsSorting;
	onSessionOpen(resource: URI): void;
}

/**
 * @deprecated Use {@link ISessionsListControlOptions} instead.
 */
export type ISessionsListOptions = ISessionsListControlOptions;

export interface ISessionsListControl {
	readonly element: HTMLElement;
	readonly onDidUpdate: Event<void>;
	refresh(): void;
	reveal(sessionResource: URI): boolean;
	clearFocus(): void;
	hasFocusOrSelection(): boolean;
	setVisible(visible: boolean): void;
	layout(height: number, width: number): void;
	focus(): void;
	update(): void;
}

export class SessionsListControl extends Disposable implements ISessionsListControl {

	private readonly listContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<SessionListItem, FuzzyScore>;
	private sessions: ISessionData[] = [];
	private visible = true;

	private readonly _onDidUpdate = this._register(new Emitter<void>());
	readonly onDidUpdate: Event<void> = this._onDidUpdate.event;

	get element(): HTMLElement { return this.listContainer; }

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsListControlOptions,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.listContainer = DOM.append(container, $('.sessions-list-control'));

		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<SessionListItem, FuzzyScore>,
			'SessionsListTree',
			this.listContainer,
			new SessionsTreeDelegate(),
			[
				new SessionItemRenderer({ grouping: this.options.grouping }),
				new SessionSectionRenderer(),
			],
			{
				accessibilityProvider: new SessionsAccessibilityProvider(),
				identityProvider: {
					getId: (element: SessionListItem) => {
						if (isSessionSection(element)) {
							return `section:${element.id}`;
						}
						return element.resource.toString();
					}
				},
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				indent: 0,
				overrideStyles: this.options.overrideStyles,
				renderIndentGuides: RenderIndentGuides.None,
				twistieAdditionalCssClass: () => 'force-no-twistie',
			}
		));

		this._register(this.tree.onDidOpen(e => {
			const element = e.element;
			if (element && !isSessionSection(element)) {
				this.options.onSessionOpen(element.resource);
			}
		}));

		this._register(this.sessionsProvidersService.onDidChangeSessions(() => {
			if (this.visible) {
				this.refresh();
			}
		}));

		this.refresh();
	}

	refresh(): void {
		this.sessions = this.sessionsProvidersService.getSessions();
		this.update();
	}

	update(): void {
		const sorted = this.sortSessions(this.sessions);
		const grouping = this.options.grouping();
		const sections = grouping === SessionsGrouping.Repository
			? this.groupByRepository(sorted)
			: this.groupByDate(sorted);

		const children: IObjectTreeElement<SessionListItem>[] = sections.map(section => ({
			element: section,
			collapsible: true,
			collapsed: ObjectTreeElementCollapseState.PreserveOrExpanded,
			children: section.sessions.map(session => ({
				element: session,
			})),
		}));

		this.tree.setChildren(null, children);
		this._onDidUpdate.fire();
	}

	reveal(sessionResource: URI): boolean {
		const resourceStr = sessionResource.toString();
		for (const session of this.sessions) {
			if (session.resource.toString() === resourceStr) {
				if (this.tree.hasElement(session)) {
					if (this.tree.getRelativeTop(session) === null) {
						this.tree.reveal(session, 0.5);
					}
					this.tree.setFocus([session]);
					this.tree.setSelection([session]);
					return true;
				}
			}
		}
		return false;
	}

	clearFocus(): void {
		this.tree.setFocus([]);
		this.tree.setSelection([]);
	}

	hasFocusOrSelection(): boolean {
		return this.tree.getFocus().length > 0 || this.tree.getSelection().length > 0;
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (this.visible) {
			this.refresh();
		}
	}

	layout(height: number, width: number): void {
		this.tree.layout(height, width);
	}

	focus(): void {
		this.tree.domFocus();
	}

	// -- Sorting --

	private sortSessions(sessions: ISessionData[]): ISessionData[] {
		const sorting = this.options.sorting();
		return [...sessions].sort((a, b) => {
			if (sorting === SessionsSorting.Updated) {
				return b.updatedAt.get().getTime() - a.updatedAt.get().getTime();
			}
			return b.createdAt.getTime() - a.createdAt.getTime();
		});
	}

	// -- Grouping --

	private groupByRepository(sessions: ISessionData[]): ISessionSection[] {
		const groups = new Map<string, ISessionData[]>();
		const order: string[] = [];
		for (const session of sessions) {
			const workspace = session.workspace.get();
			const label = workspace?.label ?? localize('noProject', "No Project");
			let group = groups.get(label);
			if (!group) {
				group = [];
				groups.set(label, group);
				order.push(label);
			}
			group.push(session);
		}

		return order.map(label => ({
			id: `repo:${label}`,
			label,
			sessions: groups.get(label)!,
		}));
	}

	private groupByDate(sessions: ISessionData[]): ISessionSection[] {
		const now = new Date();
		const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const startOfYesterday = startOfToday - 86_400_000;
		const startOfWeek = startOfToday - 7 * 86_400_000;

		const today: ISessionData[] = [];
		const yesterday: ISessionData[] = [];
		const week: ISessionData[] = [];
		const older: ISessionData[] = [];

		const sorting = this.options.sorting();
		for (const session of sessions) {
			const time = sorting === SessionsSorting.Updated
				? session.updatedAt.get().getTime()
				: session.createdAt.getTime();

			if (time >= startOfToday) {
				today.push(session);
			} else if (time >= startOfYesterday) {
				yesterday.push(session);
			} else if (time >= startOfWeek) {
				week.push(session);
			} else {
				older.push(session);
			}
		}

		const sections: ISessionSection[] = [];
		const addGroup = (id: string, label: string, groupSessions: ISessionData[]) => {
			if (groupSessions.length > 0) {
				sections.push({ id, label, sessions: groupSessions });
			}
		};

		addGroup('today', localize('today', "Today"), today);
		addGroup('yesterday', localize('yesterday', "Yesterday"), yesterday);
		addGroup('thisWeek', localize('thisWeek', "This Week"), week);
		addGroup('older', localize('older', "Older"), older);

		return sections;
	}
}

//#endregion
