/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsList.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IStyleOverride } from '../../../../platform/theme/browser/defaultStyles.js';
import { IListStyles } from '../../../../base/browser/ui/list/listWidget.js';
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

interface ISessionSection {
	readonly label: string;
	readonly sessions: ISessionData[];
}

type SessionListItem = ISessionData | ISessionSection;

function isSessionSection(item: SessionListItem): item is ISessionSection {
	return 'sessions' in item && Array.isArray((item as ISessionSection).sessions);
}

//#endregion

//#region List Delegate

class SessionsListDelegate implements IListVirtualDelegate<SessionListItem> {
	private static readonly ITEM_HEIGHT = 54;
	private static readonly SECTION_HEIGHT = 26;

	getHeight(element: SessionListItem): number {
		return isSessionSection(element) ? SessionsListDelegate.SECTION_HEIGHT : SessionsListDelegate.ITEM_HEIGHT;
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
	readonly details: HTMLElement;
	readonly status: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class SessionItemRenderer implements IListRenderer<ISessionData, ISessionItemTemplate> {
	static readonly TEMPLATE_ID = 'session-item';
	readonly templateId = SessionItemRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ISessionItemTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());

		container.classList.add('session-item');

		const iconContainer = DOM.append(container, $('.session-icon'));
		const mainCol = DOM.append(container, $('.session-main'));
		const titleRow = DOM.append(mainCol, $('.session-title-row'));
		const title = DOM.append(titleRow, $('.session-title'));
		const detailsRow = DOM.append(mainCol, $('.session-details-row'));
		const details = DOM.append(detailsRow, $('.session-details'));
		const status = DOM.append(detailsRow, $('.session-status'));

		return { container, iconContainer, title, details, status, disposables, elementDisposables };
	}

	renderElement(element: ISessionData, _index: number, template: ISessionItemTemplate): void {
		template.elementDisposables.clear();

		// Icon — reactive based on status
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = element.status.read(reader);
			DOM.clearNode(template.iconContainer);
			const icon = this.getStatusIcon(sessionStatus, element.icon);
			const iconEl = DOM.append(template.iconContainer, $(`span${ThemeIcon.asCSSSelector(icon)}`));
			iconEl.classList.toggle('session-icon-pulse', sessionStatus === SessionStatus.NeedsInput);
			iconEl.classList.toggle('session-icon-active', sessionStatus === SessionStatus.InProgress);
		}));

		// Title — reactive
		template.elementDisposables.add(autorun(reader => {
			const titleText = element.title.read(reader);
			template.title.textContent = titleText;
		}));

		// Details — workspace label
		template.elementDisposables.add(autorun(reader => {
			const workspace = element.workspace.read(reader);
			template.details.textContent = workspace?.label ?? '';
		}));

		// Status time — reactive
		const statusDisposable = template.elementDisposables.add(new MutableDisposable());
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = element.status.read(reader);
			const updatedAt = element.updatedAt.read(reader);

			if (sessionStatus === SessionStatus.InProgress) {
				template.status.textContent = localize('working', "Working...");
			} else if (sessionStatus === SessionStatus.NeedsInput) {
				template.status.textContent = localize('needsInput', "Input needed");
			} else if (sessionStatus === SessionStatus.Error) {
				template.status.textContent = localize('failed', "Failed");
			} else {
				template.status.textContent = this.formatRelativeTime(updatedAt);
				// Update relative time periodically
				const interval = setInterval(() => {
					template.status.textContent = this.formatRelativeTime(updatedAt);
				}, 60_000);
				statusDisposable.value = { dispose: () => clearInterval(interval) };
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

	private formatRelativeTime(date: Date): string {
		const now = Date.now();
		const diff = now - date.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (seconds < 60) {
			return localize('justNow', "just now");
		} else if (minutes < 60) {
			return minutes === 1
				? localize('oneMinuteAgo', "1 min ago")
				: localize('minutesAgo', "{0} min ago", minutes);
		} else if (hours < 24) {
			return hours === 1
				? localize('oneHourAgo', "1 hr ago")
				: localize('hoursAgo', "{0} hr ago", hours);
		} else {
			return days === 1
				? localize('oneDayAgo', "1 day ago")
				: localize('daysAgo', "{0} days ago", days);
		}
	}

	disposeTemplate(template: ISessionItemTemplate): void {
		template.disposables.dispose();
	}
}

//#endregion

//#region Section Header Renderer

interface ISessionSectionTemplate {
	readonly label: HTMLElement;
	readonly count: HTMLElement;
}

class SessionSectionRenderer implements IListRenderer<ISessionSection, ISessionSectionTemplate> {
	static readonly TEMPLATE_ID = 'session-section';
	readonly templateId = SessionSectionRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ISessionSectionTemplate {
		container.classList.add('session-section');
		const label = DOM.append(container, $('span.session-section-label'));
		const count = DOM.append(container, $('span.session-section-count'));
		return { label, count };
	}

	renderElement(element: ISessionSection, _index: number, template: ISessionSectionTemplate): void {
		template.label.textContent = element.label;
		template.count.textContent = String(element.sessions.length);
	}

	disposeTemplate(_template: ISessionSectionTemplate): void { }
}

//#endregion

//#region Sessions List Control

export interface ISessionsListOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly grouping: () => SessionsGrouping;
	readonly sorting: () => SessionsSorting;
	onSessionOpen(resource: URI): void;
}

export interface ISessionsListControl {
	readonly element: HTMLElement;
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
	private readonly list!: WorkbenchList<SessionListItem>;
	private flatItems: SessionListItem[] = [];
	private visible = true;

	private readonly _onDidUpdate = this._register(new Emitter<void>());
	readonly onDidUpdate: Event<void> = this._onDidUpdate.event;

	get element(): HTMLElement { return this.listContainer; }

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsListOptions,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.listContainer = DOM.append(container, $('.sessions-list'));

		// eslint-disable-next-line no-restricted-syntax
		(this as any).list = this._register(instantiationService.createInstance(WorkbenchList,
			'SessionsListView',
			this.listContainer,
			new SessionsListDelegate(),
			[
				new SessionItemRenderer(),
				new SessionSectionRenderer(),
			],
			{
				identityProvider: {
					getId: (element: unknown) => {
						if (isSessionSection(element as SessionListItem)) {
							return `section-${(element as ISessionSection).label}`;
						}
						return (element as ISessionData).resource.toString();
					}
				},
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				overrideStyles: this.options.overrideStyles,
			}
		));

		this._register(this.list.onDidOpen(e => {
			const element = e.element;
			if (element && !isSessionSection(element)) {
				this.options.onSessionOpen(element.resource);
			}
		}));

		this._register(this.sessionsProvidersService.onDidChangeSessions(() => {
			if (this.visible) {
				this.update();
			}
		}));

		this.update();
	}

	refresh(): void {
		this.update();
	}

	update(): void {
		const sessions = this.sessionsProvidersService.getSessions();
		const sorted = this.sortSessions(sessions);
		const grouping = this.options.grouping();

		if (grouping === SessionsGrouping.Repository) {
			this.flatItems = this.groupByRepository(sorted);
		} else {
			this.flatItems = this.groupByDate(sorted);
		}

		this.list.splice(0, this.list.length, this.flatItems);
		this._onDidUpdate.fire();
	}

	reveal(sessionResource: URI): boolean {
		const index = this.flatItems.findIndex(item =>
			!isSessionSection(item) && item.resource.toString() === sessionResource.toString()
		);
		if (index >= 0) {
			this.list.reveal(index, 0.5);
			this.list.setFocus([index]);
			this.list.setSelection([index]);
			return true;
		}
		return false;
	}

	clearFocus(): void {
		this.list.setFocus([]);
		this.list.setSelection([]);
	}

	hasFocusOrSelection(): boolean {
		return this.list.getFocus().length > 0 || this.list.getSelection().length > 0;
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (this.visible) {
			this.update();
		}
	}

	layout(height: number, width: number): void {
		this.list.layout(height, width);
	}

	focus(): void {
		this.list.domFocus();
	}

	// ── Sorting ──

	private sortSessions(sessions: ISessionData[]): ISessionData[] {
		const sorting = this.options.sorting();
		return [...sessions].sort((a, b) => {
			if (sorting === SessionsSorting.Updated) {
				return b.updatedAt.get().getTime() - a.updatedAt.get().getTime();
			}
			return b.createdAt.getTime() - a.createdAt.getTime();
		});
	}

	// ── Grouping ──

	private groupByRepository(sessions: ISessionData[]): SessionListItem[] {
		const groups = new Map<string, ISessionData[]>();
		for (const session of sessions) {
			const workspace = session.workspace.get();
			const label = workspace?.label ?? localize('noProject', "No Project");
			let group = groups.get(label);
			if (!group) {
				group = [];
				groups.set(label, group);
			}
			group.push(session);
		}

		const result: SessionListItem[] = [];
		for (const [label, groupSessions] of groups) {
			result.push({ label, sessions: groupSessions });
			result.push(...groupSessions);
		}
		return result;
	}

	private groupByDate(sessions: ISessionData[]): SessionListItem[] {
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

		const result: SessionListItem[] = [];
		const addGroup = (label: string, groupSessions: ISessionData[]) => {
			if (groupSessions.length > 0) {
				result.push({ label, sessions: groupSessions });
				result.push(...groupSessions);
			}
		};

		addGroup(localize('today', "Today"), today);
		addGroup(localize('yesterday', "Yesterday"), yesterday);
		addGroup(localize('thisWeek', "This Week"), week);
		addGroup(localize('older', "Older"), older);

		return result;
	}
}

//#endregion
