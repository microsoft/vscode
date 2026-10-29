/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sessionsList.css';
import './colorGroupsMockup.css';
import * as DOM from '../../../../../../base/browser/dom.js';
import { IDragAndDropData } from '../../../../../../base/browser/dnd.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { HighlightedLabel } from '../../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { IListVirtualDelegate, ListDragOverEffectPosition, ListDragOverEffectType } from '../../../../../../base/browser/ui/list/list.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../../../../../../base/browser/ui/list/listView.js';
import { IListAccessibilityProvider } from '../../../../../../base/browser/ui/list/listWidget.js';
import { createPixelSpinner } from '../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { IObjectTreeElement, ITreeDragAndDrop, ITreeDragOverReaction, ITreeNode, ITreeRenderer } from '../../../../../../base/browser/ui/tree/tree.js';
import { RenderIndentGuides } from '../../../../../../base/browser/ui/tree/abstractTree.js';
import { Action, IAction, Separator, SubmenuAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../../base/common/date.js';
import { createMatches, FuzzyScore } from '../../../../../../base/common/filters.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../../../../platform/list/browser/listService.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';
import { computePullRequestIcon } from '../../../../../../workbench/common/chatPullRequest.js';
import { SessionStatusIcon } from '../../../../../browser/sessionStatusIcon.js';
import { SessionStatus } from '../../../../../services/sessions/common/session.js';
import { describeMockColor, IResolvedMockColor, MockColor, MockTextColorMode, resolveMockColor } from './colorGroupsMockupColors.js';
import { BUILT_IN_SECTIONS, ColorGroupsMockModel, getBuiltInSectionStyle, getCollectionSessions, getGroup, getSectionOrder, getSessionsAttention, getWorkspaceStyle, groupKey, IMockSession, IMockState, isBuiltInSection, isQuickChat, MockBuiltInSection, MockPullRequest, MockSectionKey, MockSessionStatus, workspaceKey } from './colorGroupsMockupModel.js';

const $ = DOM.$;

//#region Options

export const enum MockGroupStyle {
	/** Browser-style pill with a colored rail beside the members (the default). */
	Rail = 'rail',
	/** Solid header, colored outline around the members. */
	Outline = 'outline',
	/** Pill inside a softly tinted card. */
	Tint = 'tint',
	/** Quiet: colored dot and rail, no fills. */
	Dot = 'dot',
}

export const enum MockDensity {
	Comfortable = 'comfortable',
	Compact = 'compact',
}

//#endregion

//#region Rows

export const enum MockRowKind {
	Section = 'section',
	Group = 'group',
	Session = 'session',
	Placeholder = 'placeholder',
}

/** A neutral (uncolored) section: Pinned, Chats, Done, or an uncolored workspace. */
export interface IMockSectionRow {
	readonly kind: MockRowKind.Section;
	readonly id: string;
	readonly sectionKey: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly workspace?: string;
	/** Set for the colorable built-in sections (Pinned and Chats). */
	readonly builtIn?: MockBuiltInSection;
	readonly sessions: readonly IMockSession[];
	readonly collapsed: boolean;
}

/** A colored header: a custom group, a workspace, or a built-in section with a color. */
export interface IMockGroupRow {
	readonly kind: MockRowKind.Group;
	readonly id: string;
	readonly key: MockSectionKey | MockBuiltInSection;
	readonly label: string;
	readonly groupId?: string;
	readonly workspace?: string;
	readonly builtIn?: MockBuiltInSection;
	/** Icon shown in the pill; groups have none. */
	readonly icon?: ThemeIcon;
	readonly color: MockColor;
	readonly textMode: MockTextColorMode;
	readonly resolved: IResolvedMockColor;
	readonly sessions: readonly IMockSession[];
	readonly collapsed: boolean;
}

interface IMockFrame {
	readonly resolved: IResolvedMockColor;
	readonly first: boolean;
	readonly last: boolean;
}

export interface IMockSessionRow {
	readonly kind: MockRowKind.Session;
	readonly id: string;
	readonly session: IMockSession;
	readonly frame?: IMockFrame;
	/** Whether the details row names the workspace (the section does not already). */
	readonly showWorkspace: boolean;
	readonly groupId?: string;
}

export interface IMockPlaceholderRow {
	readonly kind: MockRowKind.Placeholder;
	readonly id: string;
	readonly groupId?: string;
	readonly frame?: IMockFrame;
}

export type MockRow = IMockSectionRow | IMockGroupRow | IMockSessionRow | IMockPlaceholderRow;

function isSessionRow(row: MockRow): row is IMockSessionRow {
	return row.kind === MockRowKind.Session;
}

/** Builds the tree for one collection: fixed sections, then user-ordered groups and workspaces, then Done. */
export function buildMockRows(state: IMockState, collectionId: string, scheme: ColorScheme): IObjectTreeElement<MockRow>[] {
	const sessions = getCollectionSessions(state, collectionId);
	const rows: IObjectTreeElement<MockRow>[] = [];
	const isCollapsed = (sectionKey: string) => state.collapsedSections.includes(`${collectionId}/${sectionKey}`);

	const sectionRow = (sectionKey: string, label: string, icon: ThemeIcon, members: readonly IMockSession[], showWorkspace: boolean, workspace?: string): IObjectTreeElement<MockRow> => {
		const collapsed = isCollapsed(sectionKey);
		const builtIn = isBuiltInSection(sectionKey) ? sectionKey : undefined;
		const element: IMockSectionRow = { kind: MockRowKind.Section, id: `section:${collectionId}/${sectionKey}`, sectionKey, label, icon, workspace, builtIn, sessions: members, collapsed };
		return {
			element,
			collapsible: true,
			collapsed,
			children: members.map(session => ({ element: { kind: MockRowKind.Session, id: session.id, session, showWorkspace } satisfies IMockSessionRow })),
		};
	};

	// Built-in sections keep their names and place; a color only changes how they render.
	const builtInRow = (section: MockBuiltInSection, members: readonly IMockSession[], showWorkspace: boolean): IObjectTreeElement<MockRow> => {
		const { label, icon } = BUILT_IN_SECTIONS[section];
		const style = getBuiltInSectionStyle(state, section);
		return style.color
			? coloredRow({ key: section, label, builtIn: section, icon, color: style.color, textMode: style.textMode, collapsed: isCollapsed(section) }, members, scheme, showWorkspace)
			: sectionRow(section, label, icon, members, showWorkspace);
	};

	const pinned = sessions.filter(s => s.pinned);
	if (pinned.length) {
		rows.push(builtInRow(MockBuiltInSection.Pinned, pinned, true));
	}
	const chats = sessions.filter(s => !s.pinned && !s.groupId && isQuickChat(s));
	if (chats.length) {
		rows.push(builtInRow(MockBuiltInSection.Chats, chats, false));
	}

	for (const key of getSectionOrder(state, collectionId)) {
		if (key.startsWith('group:')) {
			const group = getGroup(state, key.slice('group:'.length));
			if (!group) {
				continue;
			}
			const members = sessions.filter(s => s.groupId === group.id && !s.pinned);
			rows.push(coloredRow({ key, label: group.name, groupId: group.id, color: group.color, textMode: group.textMode, collapsed: group.collapsed }, members, scheme, true));
			continue;
		}
		const workspace = key.slice('workspace:'.length);
		const members = sessions.filter(s => s.workspace === workspace && !s.groupId && !s.pinned);
		const style = getWorkspaceStyle(state, workspace);
		if (style.color) {
			rows.push(coloredRow({ key, label: workspace, workspace, icon: Codicon.folder, color: style.color, textMode: style.textMode, collapsed: isCollapsed(key) }, members, scheme, false));
		} else {
			rows.push(sectionRow(key, workspace, Codicon.folder, members, false, workspace));
		}
	}

	const done = state.sessions.filter(s => s.collectionId === collectionId && s.archived);
	if (done.length) {
		rows.push(sectionRow('done', 'Done', Codicon.archive, done, true));
	}
	return rows;
}

function coloredRow(header: { key: MockSectionKey | MockBuiltInSection; label: string; groupId?: string; workspace?: string; builtIn?: MockBuiltInSection; icon?: ThemeIcon; color: MockColor; textMode: MockTextColorMode; collapsed: boolean }, members: readonly IMockSession[], scheme: ColorScheme, showWorkspace: boolean): IObjectTreeElement<MockRow> {
	const resolved = resolveMockColor(header.color, scheme, header.textMode);
	const element: IMockGroupRow = { kind: MockRowKind.Group, id: header.key, ...header, resolved, sessions: members };
	const children: IObjectTreeElement<MockRow>[] = members.length
		? members.map((session, index) => ({ element: { kind: MockRowKind.Session, id: session.id, session, showWorkspace, groupId: header.groupId, frame: { resolved, first: index === 0, last: index === members.length - 1 } } satisfies IMockSessionRow }))
		: [{ element: { kind: MockRowKind.Placeholder, id: `placeholder:${header.key}`, groupId: header.groupId, frame: { resolved, first: true, last: true } } satisfies IMockPlaceholderRow }];
	return { element, collapsible: true, collapsed: header.collapsed, children };
}

//#endregion

//#region Delegate

class MockTreeDelegate implements IListVirtualDelegate<MockRow> {

	constructor(private readonly density: () => MockDensity) { }

	getHeight(row: MockRow): number {
		const compact = this.density() === MockDensity.Compact;
		switch (row.kind) {
			case MockRowKind.Section:
				return 26;
			case MockRowKind.Group:
				// Top gap plus the pill.
				return compact ? 4 + 24 : 6 + 26;
			case MockRowKind.Placeholder:
				return 28 + (row.frame?.last ? 4 : 0);
			case MockRowKind.Session: {
				const base = compact || isQuickChat(row.session) ? 28 : 54;
				return base + (row.frame?.last ? 4 : 0);
			}
		}
	}

	getTemplateId(row: MockRow): string {
		return row.kind;
	}
}

//#endregion

//#region Renderers

export interface IMockListActions {
	toggle(row: IMockSectionRow | IMockGroupRow): void;
	editHeader(row: IMockGroupRow | IMockSectionRow, anchor: HTMLElement): void;
	newSession(row: IMockSectionRow | IMockGroupRow): void;
	showContextMenu(row: MockRow, anchor: HTMLElement | { x: number; y: number }): void;
	archive(row: IMockSessionRow): void;
	/** Rows whose header should render as an active drop target. */
	readonly dropTargetKey: IObservable<string | undefined>;
}

/** What a colored header represents, for hovers and screen readers. */
function headerKind(row: IMockGroupRow): string {
	return row.groupId ? 'group' : row.workspace ? 'workspace' : 'section';
}

function applyColorVariables(element: HTMLElement, resolved: IResolvedMockColor): void {
	element.style.setProperty('--cg-fill', resolved.fill);
	element.style.setProperty('--cg-text', resolved.text);
}

function clearColorVariables(element: HTMLElement): void {
	element.style.removeProperty('--cg-fill');
	element.style.removeProperty('--cg-text');
}

interface ISectionTemplate {
	readonly container: HTMLElement;
	readonly chevron: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly toolbar: ActionBar;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class MockSectionRenderer implements ITreeRenderer<MockRow, FuzzyScore, ISectionTemplate> {
	readonly templateId = MockRowKind.Section;

	constructor(private readonly actions: IMockListActions) { }

	renderTemplate(container: HTMLElement): ISectionTemplate {
		const disposables = new DisposableStore();
		const root = DOM.append(container, $('.cg-row.cg-section-row'));
		const header = DOM.append(root, $('.session-section'));
		const chevron = DOM.append(header, $('span.session-section-chevron'));
		const icon = DOM.append(header, $('span.session-section-icon'));
		const labelContainer = DOM.append(header, $('span.session-section-label-container'));
		const label = DOM.append(labelContainer, $('span.session-section-label'));
		const toolbarContainer = DOM.append(header, $('.session-section-toolbar'));
		const toolbar = disposables.add(new ActionBar(toolbarContainer));
		disposables.add(DOM.addDisposableListener(toolbarContainer, DOM.EventType.CLICK, e => e.stopPropagation()));
		return { container: root, chevron, icon, label, toolbar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement(node: ITreeNode<MockRow, FuzzyScore>, _index: number, template: ISectionTemplate): void {
		const row = node.element;
		if (row.kind !== MockRowKind.Section) {
			return;
		}
		template.elementDisposables.clear();
		template.container.dataset.cgId = row.id;
		template.label.textContent = row.label;
		template.icon.className = `session-section-icon ${ThemeIcon.asClassName(row.icon)}`;
		template.chevron.className = `session-section-chevron collapsible ${ThemeIcon.asClassName(node.collapsed ? Codicon.chevronRight : Codicon.chevronDown)}`;
		template.elementDisposables.add(DOM.addDisposableListener(template.container, DOM.EventType.CLICK, () => this.actions.toggle(row)));
		template.elementDisposables.add(autorun(reader => {
			template.container.classList.toggle('cg-drop-target', this.actions.dropTargetKey.read(reader) === row.id);
		}));

		template.toolbar.clear();
		const actions: Action[] = [];
		if (row.workspace || row.builtIn) {
			actions.push(template.elementDisposables.add(new Action('cg.color', row.builtIn ? 'Color Section…' : 'Color Workspace…', ThemeIcon.asClassName(Codicon.symbolColor), true, async () => this.actions.editHeader(row, template.container))));
		}
		if (row.workspace || row.builtIn === MockBuiltInSection.Chats) {
			actions.push(template.elementDisposables.add(new Action('cg.newSession', 'New Session', ThemeIcon.asClassName(Codicon.add), true, async () => this.actions.newSession(row))));
		}
		template.toolbar.push(actions, { icon: true, label: false });
	}

	disposeElement(_node: ITreeNode<MockRow, FuzzyScore>, _index: number, template: ISectionTemplate): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(template: ISectionTemplate): void {
		template.disposables.dispose();
	}
}

interface IGroupTemplate {
	readonly container: HTMLElement;
	readonly header: HTMLElement;
	readonly pill: HTMLElement;
	readonly chevron: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly count: HTMLElement;
	readonly status: HTMLElement;
	readonly toolbar: ActionBar;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class MockGroupRenderer implements ITreeRenderer<MockRow, FuzzyScore, IGroupTemplate> {
	readonly templateId = MockRowKind.Group;

	constructor(private readonly actions: IMockListActions, private readonly hoverService: IHoverService) { }

	renderTemplate(container: HTMLElement): IGroupTemplate {
		const disposables = new DisposableStore();
		const root = DOM.append(container, $('.cg-row.cg-group-row'));
		const header = DOM.append(root, $('.cg-group-header'));
		const pill = DOM.append(header, $('.cg-pill'));
		const chevron = DOM.append(pill, $('span.cg-pill-chevron'));
		const icon = DOM.append(pill, $('span.cg-pill-icon'));
		const label = DOM.append(pill, $('span.cg-pill-label'));
		const count = DOM.append(pill, $('span.cg-pill-count'));
		const status = DOM.append(pill, $('span.cg-pill-status'));
		const toolbarContainer = DOM.append(header, $('.cg-group-toolbar'));
		const toolbar = disposables.add(new ActionBar(toolbarContainer));
		disposables.add(DOM.addDisposableListener(toolbarContainer, DOM.EventType.CLICK, e => e.stopPropagation()));
		return { container: root, header, pill, chevron, icon, label, count, status, toolbar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement(node: ITreeNode<MockRow, FuzzyScore>, _index: number, template: IGroupTemplate): void {
		const row = node.element;
		if (row.kind !== MockRowKind.Group) {
			return;
		}
		template.elementDisposables.clear();
		template.container.dataset.cgId = row.id;
		applyColorVariables(template.container, row.resolved);
		template.container.classList.toggle('collapsed', node.collapsed);
		template.container.classList.toggle('cg-workspace', !!row.workspace);
		template.container.classList.toggle('cg-text-light', row.resolved.textIsLight);
		template.label.textContent = row.label;
		template.chevron.className = `cg-pill-chevron ${ThemeIcon.asClassName(node.collapsed ? Codicon.chevronRight : Codicon.chevronDown)}`;
		template.icon.className = row.icon ? `cg-pill-icon ${ThemeIcon.asClassName(row.icon)}` : 'cg-pill-icon';
		template.count.textContent = node.collapsed && row.sessions.length ? String(row.sessions.length) : '';

		DOM.clearNode(template.status);
		const attention = node.collapsed ? getSessionsAttention(row.sessions) : undefined;
		template.status.className = 'cg-pill-status';
		if (attention === MockSessionStatus.InProgress || attention === MockSessionStatus.NeedsInput) {
			const spinner = template.elementDisposables.add(createPixelSpinner(undefined, { variant: attention === MockSessionStatus.NeedsInput ? 'ring' : 'grid' }));
			template.status.appendChild(spinner.element);
			template.status.classList.add(attention === MockSessionStatus.NeedsInput ? 'needs-input' : 'in-progress');
		} else if (attention === MockSessionStatus.Unread) {
			template.status.classList.add('unread');
		}

		template.elementDisposables.add(DOM.addDisposableListener(template.header, DOM.EventType.CLICK, () => this.actions.toggle(row)));
		template.elementDisposables.add(autorun(reader => {
			template.container.classList.toggle('cg-drop-target', this.actions.dropTargetKey.read(reader) === row.id);
		}));

		const statusText = attention === MockSessionStatus.NeedsInput ? ' · needs input' : attention === MockSessionStatus.InProgress ? ' · in progress' : attention === MockSessionStatus.Unread ? ' · unread' : '';
		template.elementDisposables.add(this.hoverService.setupDelayedHover(template.pill, {
			content: `${row.label} — ${headerKind(row)} · ${describeMockColor(row.color)} · ${row.sessions.length} session${row.sessions.length === 1 ? '' : 's'}${statusText}`,
		}));

		template.toolbar.clear();
		const actions: Action[] = [];
		if (!row.builtIn || row.builtIn === MockBuiltInSection.Chats) {
			actions.push(template.elementDisposables.add(new Action('cg.newSession', row.groupId ? 'New Session in Group' : 'New Session', ThemeIcon.asClassName(Codicon.add), true, async () => this.actions.newSession(row))));
		}
		actions.push(template.elementDisposables.add(new Action('cg.edit', row.groupId ? 'Edit Group…' : row.workspace ? 'Edit Workspace Color…' : 'Edit Section Color…', ThemeIcon.asClassName(Codicon.edit), true, async () => this.actions.editHeader(row, template.pill))));
		template.toolbar.push(actions, { icon: true, label: false });
	}

	disposeElement(_node: ITreeNode<MockRow, FuzzyScore>, _index: number, template: IGroupTemplate): void {
		template.elementDisposables.clear();
		clearColorVariables(template.container);
	}

	disposeTemplate(template: IGroupTemplate): void {
		template.disposables.dispose();
	}
}

interface ISessionTemplate {
	readonly container: HTMLElement;
	readonly item: HTMLElement;
	readonly statusIcon: SessionStatusIcon;
	readonly title: HighlightedLabel;
	readonly detailsRow: HTMLElement;
	readonly hoverDescription: HTMLElement;
	readonly toolbar: ActionBar;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

function toSessionStatus(session: IMockSession): { status: SessionStatus; isRead: boolean } {
	switch (session.status) {
		case MockSessionStatus.InProgress: return { status: SessionStatus.InProgress, isRead: true };
		case MockSessionStatus.NeedsInput: return { status: SessionStatus.NeedsInput, isRead: true };
		case MockSessionStatus.Unread: return { status: SessionStatus.Completed, isRead: false };
		default: return { status: SessionStatus.Completed, isRead: true };
	}
}

function pullRequestIcon(pr: MockPullRequest | undefined): ThemeIcon | undefined {
	return pr ? computePullRequestIcon(pr) : undefined;
}

class MockSessionRenderer implements ITreeRenderer<MockRow, FuzzyScore, ISessionTemplate> {
	readonly templateId = MockRowKind.Session;

	constructor(
		private readonly actions: IMockListActions,
		private readonly density: () => MockDensity,
		private readonly instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): ISessionTemplate {
		const disposables = new DisposableStore();
		const root = DOM.append(container, $('.cg-row.cg-session-row'));
		DOM.append(root, $('.cg-frame'));
		DOM.append(root, $('.cg-row-bg'));
		const item = DOM.append(root, $('.session-item'));
		const iconContainer = DOM.append(item, $('.session-icon'));
		const statusIcon = disposables.add(this.instantiationService.createInstance(SessionStatusIcon, iconContainer));
		const main = DOM.append(item, $('.session-main'));
		const titleRow = DOM.append(main, $('.session-title-row'));
		const titleContainer = DOM.append(titleRow, $('.session-title'));
		const title = disposables.add(new HighlightedLabel(titleContainer));
		const hoverDescription = DOM.append(titleRow, $('.session-compact-hover-description'));
		const toolbarContainer = DOM.append(titleRow, $('.session-title-toolbar'));
		const toolbar = disposables.add(new ActionBar(toolbarContainer));
		for (const eventType of [DOM.EventType.CLICK, DOM.EventType.MOUSE_DOWN, DOM.EventType.DBLCLICK]) {
			disposables.add(DOM.addDisposableListener(toolbarContainer, eventType, e => e.stopPropagation()));
		}
		const detailsRow = DOM.append(main, $('.session-details-row'));
		return { container: root, item, statusIcon, title, detailsRow, hoverDescription, toolbar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement(node: ITreeNode<MockRow, FuzzyScore>, _index: number, template: ISessionTemplate): void {
		const row = node.element;
		if (row.kind !== MockRowKind.Session) {
			return;
		}
		template.elementDisposables.clear();
		template.container.dataset.cgId = row.id;
		const session = row.session;
		const quickChat = isQuickChat(session);
		const compact = this.density() === MockDensity.Compact;

		renderFrame(template.container, row.frame);
		template.item.classList.toggle('quick-chat', quickChat);
		template.item.classList.toggle('unread', session.status === MockSessionStatus.Unread);
		template.item.classList.toggle('needs-input', session.status === MockSessionStatus.NeedsInput);
		template.item.classList.toggle('archived', !!session.archived);

		const { status, isRead } = toSessionStatus(session);
		template.statusIcon.setStatus(status, isRead, !!session.archived, pullRequestIcon(session.pr), URI.parse(`mock-session:/${session.id}`));
		template.title.set(session.title, createMatches(node.filterData));

		DOM.clearNode(template.hoverDescription);
		DOM.clearNode(template.detailsRow);
		if (compact && !quickChat && row.showWorkspace && session.workspace) {
			DOM.append(template.hoverDescription, $('span.session-badge', undefined, session.workspace));
		}
		if (!quickChat && !compact) {
			renderDetails(template.detailsRow, session, row.showWorkspace);
		}

		template.toolbar.clear();
		const done = template.elementDisposables.add(new Action('cg.archive', session.archived ? 'Restore' : 'Mark as Done', ThemeIcon.asClassName(session.archived ? Codicon.discard : Codicon.check), true, async () => this.actions.archive(row)));
		const more = template.elementDisposables.add(new Action('cg.more', 'More Actions…', ThemeIcon.asClassName(Codicon.ellipsis), true, async () => this.actions.showContextMenu(row, template.toolbar.getContainer())));
		template.toolbar.push([done, more], { icon: true, label: false });
	}

	disposeElement(_node: ITreeNode<MockRow, FuzzyScore>, _index: number, template: ISessionTemplate): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(template: ISessionTemplate): void {
		template.disposables.dispose();
	}
}

function renderFrame(container: HTMLElement, frame: IMockFrame | undefined): void {
	container.classList.toggle('cg-framed', !!frame);
	container.classList.toggle('cg-frame-first', !!frame?.first);
	container.classList.toggle('cg-frame-last', !!frame?.last);
	if (frame) {
		applyColorVariables(container, frame.resolved);
	} else {
		clearColorVariables(container);
	}
}

/** Mirrors the production details row: type icon, workspace badge, diff, then status or time. */
function renderDetails(detailsRow: HTMLElement, session: IMockSession, showWorkspace: boolean): void {
	const parts: HTMLElement[] = [];
	const separator = () => {
		if (parts.length) {
			DOM.append(detailsRow, $('span.session-separator.has-separator'));
		}
	};
	if (session.status !== MockSessionStatus.InProgress) {
		const typeIcon = DOM.append(detailsRow, $('span.session-details-icon'));
		DOM.append(typeIcon, $(`span${ThemeIcon.asCSSSelector(session.pr ? Codicon.worktreeCompact : Codicon.folderCompact)}`));
		parts.push(typeIcon);
	}
	const active = session.status === MockSessionStatus.InProgress || session.status === MockSessionStatus.NeedsInput;
	if (!active && showWorkspace && session.workspace) {
		parts.push(DOM.append(detailsRow, $('span.session-badge', undefined, session.workspace)));
	}
	if (!active && session.diff) {
		separator();
		const diff = DOM.append(detailsRow, $('span.session-diff'));
		DOM.append(diff, $('span.session-diff-added', undefined, `+${session.diff.additions}`));
		DOM.append(diff, $('span.session-diff-removed', undefined, `-${session.diff.deletions}`));
		parts.push(diff);
	}
	if (active) {
		separator();
		parts.push(DOM.append(detailsRow, $('span.session-description', undefined, session.status === MockSessionStatus.NeedsInput ? 'Waiting for your input' : (session.description ?? 'Working…'))));
	} else {
		separator();
		const minutes = session.minutesAgo;
		parts.push(DOM.append(detailsRow, $('span.session-time', undefined, minutes < 1 ? 'now' : fromNow(Date.now() - minutes * 60_000, true))));
	}
}

interface IPlaceholderTemplate {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
}

class MockPlaceholderRenderer implements ITreeRenderer<MockRow, FuzzyScore, IPlaceholderTemplate> {
	readonly templateId = MockRowKind.Placeholder;

	renderTemplate(container: HTMLElement): IPlaceholderTemplate {
		const root = DOM.append(container, $('.cg-row.cg-placeholder-row'));
		DOM.append(root, $('.cg-frame'));
		const label = DOM.append(root, $('span.cg-placeholder-label'));
		return { container: root, label };
	}

	renderElement(node: ITreeNode<MockRow, FuzzyScore>, _index: number, template: IPlaceholderTemplate): void {
		const row = node.element;
		if (row.kind !== MockRowKind.Placeholder) {
			return;
		}
		renderFrame(template.container, row.frame);
		template.label.textContent = 'Drag sessions here';
	}

	disposeTemplate(): void { }
}

//#endregion

//#region Drag and drop

export interface IMockDragState {
	readonly sessionIds: readonly string[];
	readonly sectionKey?: MockSectionKey;
}

interface IDropIntent {
	readonly apply: () => void;
	readonly reaction: ITreeDragOverReaction;
	readonly headerId?: string;
}

function sectorToPosition(sector: ListViewTargetSector | undefined): 'before' | 'after' {
	return sector !== undefined && sector >= ListViewTargetSector.CENTER_BOTTOM ? 'after' : 'before';
}

function between(position: 'before' | 'after'): ITreeDragOverReaction {
	return { accept: true, effect: { type: ListDragOverEffectType.Move, position: position === 'after' ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before } };
}

const OVER: ITreeDragOverReaction = { accept: true, effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.Over }, feedback: [] };

class MockDragAndDrop implements ITreeDragAndDrop<MockRow> {

	private readonly _dragState = observableValue<IMockDragState | undefined>(this, undefined);
	readonly dragState: IObservable<IMockDragState | undefined> = this._dragState;

	constructor(
		private readonly model: ColorGroupsMockModel,
		private readonly collectionId: () => string,
		private readonly setDropTarget: (id: string | undefined) => void,
	) { }

	getDragURI(row: MockRow): string | null {
		switch (row.kind) {
			case MockRowKind.Session: return `session:${row.id}`;
			case MockRowKind.Group: return row.builtIn ? null : `header:${row.key}`;
			case MockRowKind.Section: return row.workspace ? `header:${row.sectionKey}` : null;
			default: return null;
		}
	}

	getDragLabel(rows: MockRow[]): string | undefined {
		const sessions = rows.filter(isSessionRow);
		if (sessions.length > 1) {
			return `${sessions.length} sessions`;
		}
		const first = rows[0];
		if (!first) {
			return undefined;
		}
		return first.kind === MockRowKind.Session ? first.session.title : first.kind === MockRowKind.Group || first.kind === MockRowKind.Section ? first.label : undefined;
	}

	onDragStart(data: IDragAndDropData): void {
		const rows = this.rowsOf(data);
		const header = rows.find(r => (r.kind === MockRowKind.Group && !r.builtIn) || (r.kind === MockRowKind.Section && r.workspace));
		if (header) {
			this._dragState.set({ sessionIds: [], sectionKey: header.kind === MockRowKind.Group ? header.key as MockSectionKey : workspaceKey((header as IMockSectionRow).workspace!) }, undefined);
			return;
		}
		this._dragState.set({ sessionIds: rows.filter(isSessionRow).map(r => r.session.id) }, undefined);
	}

	onDragEnd(): void {
		this._dragState.set(undefined, undefined);
		this.setDropTarget(undefined);
	}

	onDragOver(data: IDragAndDropData, target: MockRow | undefined, _targetIndex: number | undefined, sector: ListViewTargetSector | undefined): boolean | ITreeDragOverReaction {
		const intent = this.resolve(data, target, sector);
		this.setDropTarget(intent?.headerId);
		return intent?.reaction ?? false;
	}

	drop(data: IDragAndDropData, target: MockRow | undefined, _targetIndex: number | undefined, sector: ListViewTargetSector | undefined): void {
		const intent = this.resolve(data, target, sector);
		this.setDropTarget(undefined);
		intent?.apply();
	}

	dispose(): void { }

	private rowsOf(data: IDragAndDropData): MockRow[] {
		return data instanceof ElementsDragAndDropData ? data.elements as MockRow[] : [];
	}

	private resolve(data: IDragAndDropData, target: MockRow | undefined, sector: ListViewTargetSector | undefined): IDropIntent | undefined {
		if (!target) {
			return undefined;
		}
		const rows = this.rowsOf(data);
		const state = this.model.current;
		const collectionId = this.collectionId();
		const position = sectorToPosition(sector);

		// Reordering top-level groups and workspaces. Built-in sections keep their place.
		const draggedKey = this._dragState.get()?.sectionKey;
		if (draggedKey) {
			const targetKey = target.kind === MockRowKind.Group && !target.builtIn ? target.key as MockSectionKey : target.kind === MockRowKind.Section && target.workspace ? workspaceKey(target.workspace) : undefined;
			if (!targetKey || targetKey === draggedKey) {
				return undefined;
			}
			return { reaction: between(position), apply: () => this.model.reorderSection(collectionId, draggedKey, targetKey, position) };
		}

		const sessionIds = rows.filter(isSessionRow).map(r => r.session.id);
		if (!sessionIds.length) {
			return undefined;
		}
		const dragged = sessionIds.map(id => state.sessions.find(s => s.id === id)!).filter(Boolean);
		// Dropping on Pinned pins; dropping quick chats on Chats takes them out of their groups.
		const builtInDrop = (section: MockBuiltInSection, headerId: string): IDropIntent | undefined => {
			if (section === MockBuiltInSection.Pinned) {
				return { headerId, reaction: OVER, apply: () => this.model.setPinned(sessionIds, true) };
			}
			return dragged.every(isQuickChat) ? { headerId, reaction: OVER, apply: () => this.model.removeSessionsFromGroup(sessionIds) } : undefined;
		};

		switch (target.kind) {
			case MockRowKind.Group:
				if (target.builtIn) {
					return builtInDrop(target.builtIn, target.id);
				}
				if (target.groupId) {
					const groupId = target.groupId;
					return { headerId: target.id, reaction: OVER, apply: () => this.model.addSessionsToGroup(sessionIds, groupId) };
				}
				if (target.workspace && dragged.every(s => s.workspace === target.workspace)) {
					return { headerId: target.id, reaction: OVER, apply: () => this.model.removeSessionsFromGroup(sessionIds) };
				}
				return undefined;
			case MockRowKind.Placeholder:
				if (target.groupId) {
					const groupId = target.groupId;
					return { headerId: groupKey(groupId), reaction: OVER, apply: () => this.model.addSessionsToGroup(sessionIds, groupId) };
				}
				return undefined;
			case MockRowKind.Section: {
				if (target.builtIn) {
					return builtInDrop(target.builtIn, target.id);
				}
				if (target.sectionKey === 'done') {
					return { headerId: target.id, reaction: OVER, apply: () => this.model.setArchived(sessionIds, true) };
				}
				if (target.workspace && dragged.every(s => s.workspace === target.workspace)) {
					return { headerId: target.id, reaction: OVER, apply: () => this.model.removeSessionsFromGroup(sessionIds) };
				}
				return undefined;
			}
			case MockRowKind.Session: {
				if (sessionIds.includes(target.session.id)) {
					return undefined;
				}
				const targetSession = target.session;
				if (targetSession.archived) {
					return undefined;
				}
				if (targetSession.pinned) {
					return { reaction: between(position), apply: () => this.model.setPinned(sessionIds, true, targetSession.id, position) };
				}
				if (targetSession.groupId) {
					const groupId = targetSession.groupId;
					return { reaction: between(position), apply: () => this.model.addSessionsToGroup(sessionIds, groupId, targetSession.id, position) };
				}
				// Ungrouped: only sessions of the same workspace (or quick chats among chats) can land here.
				const sameSection = dragged.every(s => s.workspace === targetSession.workspace && !s.pinned);
				if (!sameSection) {
					return undefined;
				}
				return {
					reaction: between(position),
					apply: () => dragged.some(s => s.groupId) ? this.model.removeSessionsFromGroup(sessionIds, targetSession.id, position) : this.model.reorderSessions(sessionIds, targetSession.id, position),
				};
			}
		}
	}
}

//#endregion

//#region Accessibility

class MockAccessibilityProvider implements IListAccessibilityProvider<MockRow> {
	getWidgetAriaLabel(): string {
		return 'Sessions';
	}

	getRole(): 'treeitem' {
		return 'treeitem';
	}

	getAriaLabel(row: MockRow): string {
		switch (row.kind) {
			case MockRowKind.Section:
				return `${row.label}, ${row.sessions.length} sessions`;
			case MockRowKind.Group:
				return `${row.label}, ${headerKind(row)}, ${describeMockColor(row.color)}, ${row.sessions.length} sessions`;
			case MockRowKind.Placeholder:
				return 'Empty group. Drag sessions here.';
			case MockRowKind.Session: {
				const status = row.session.status === MockSessionStatus.NeedsInput ? ', needs input' : row.session.status === MockSessionStatus.InProgress ? ', in progress' : row.session.status === MockSessionStatus.Unread ? ', unread' : '';
				return `${row.session.title}${status}${row.session.workspace ? `, ${row.session.workspace}` : ''}`;
			}
		}
	}
}

//#endregion

//#region List

export interface IMockListOptions {
	readonly collectionId: IObservable<string>;
	readonly density: IObservable<MockDensity>;
	readonly scheme: ColorScheme;
}

export interface IMockListDelegate {
	editHeader(row: IMockGroupRow | IMockSectionRow, anchor: HTMLElement): void;
	openSession(sessionId: string): void;
	/** Starts a new session composer preset to a group or workspace. */
	newSession(target: { readonly groupId?: string; readonly workspace?: string }): void;
	buildMoveToCollectionActions(apply: (collectionId: string) => void, exclude: string): IAction[];
}

/**
 * The mockup's sessions list: a real workbench tree whose rows reuse the
 * production session row DOM and styles, with colored group headers.
 */
export class ColorGroupsMockList extends Disposable {

	readonly element: HTMLElement;
	private readonly tree: WorkbenchObjectTree<MockRow, FuzzyScore>;
	private readonly dnd: MockDragAndDrop;
	private readonly _dropTargetKey = observableValue<string | undefined>(this, undefined);
	private readonly pendingEdit = this._register(new MutableDisposable());

	/** The session ids being dragged, for drop targets outside the list. */
	get dragState(): IObservable<IMockDragState | undefined> {
		return this.dnd.dragState;
	}

	constructor(
		container: HTMLElement,
		private readonly model: ColorGroupsMockModel,
		private readonly options: IMockListOptions,
		private readonly delegate: IMockListDelegate,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
	) {
		super();

		this.element = DOM.append(container, $('.cg-list.sessions-list-control'));
		const density = () => this.options.density.get();
		const actions: IMockListActions = {
			toggle: row => this.toggle(row),
			editHeader: (row, anchor) => this.delegate.editHeader(row, anchor),
			newSession: row => this.newSession(row),
			showContextMenu: (row, anchor) => this.showContextMenu(row, anchor),
			archive: row => this.model.setArchived([row.session.id], !row.session.archived),
			dropTargetKey: this._dropTargetKey,
		};

		this.dnd = new MockDragAndDrop(model, () => this.options.collectionId.get(), id => this._dropTargetKey.set(id, undefined));
		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<MockRow, FuzzyScore>,
			'ColorGroupsMockTree',
			this.element,
			new MockTreeDelegate(density),
			[
				new MockSectionRenderer(actions),
				new MockGroupRenderer(actions, hoverService),
				new MockSessionRenderer(actions, density, instantiationService),
				new MockPlaceholderRenderer(),
			],
			{
				accessibilityProvider: new MockAccessibilityProvider(),
				identityProvider: { getId: (row: MockRow) => row.id },
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (row: MockRow) => row.kind === MockRowKind.Session ? row.session.title : row.kind === MockRowKind.Placeholder ? undefined : row.label,
				},
				dnd: this.dnd,
				horizontalScrolling: false,
				multipleSelectionSupport: true,
				expandOnlyOnTwistieClick: true,
				expandOnDoubleClick: false,
				renderIndentGuides: RenderIndentGuides.None,
				indent: 0,
				twistieAdditionalCssClass: () => 'force-no-twistie',
				findWidgetEnabled: true,
			},
		));
		this.tree.updateOptions({ indent: 0, defaultIndent: 0 });

		this._register(this.tree.onDidOpen(e => {
			if (e.element?.kind === MockRowKind.Session) {
				this.model.markRead(e.element.session.id);
				this.delegate.openSession(e.element.session.id);
			}
		}));
		this._register(this.tree.onContextMenu(e => {
			if (e.element) {
				e.browserEvent.preventDefault();
				e.browserEvent.stopPropagation();
				this.showContextMenu(e.element, e.anchor instanceof HTMLElement ? e.anchor : { x: e.anchor.posx, y: e.anchor.posy });
			}
		}));
		this._register(this.tree.onDidChangeCollapseState(e => {
			// Keyboard collapse goes through the tree; mirror it into the model.
			const row = e.node.element;
			if (!row || (row.kind !== MockRowKind.Group && row.kind !== MockRowKind.Section) || row.collapsed === e.node.collapsed) {
				return;
			}
			queueMicrotask(() => this.setCollapsed(row, e.node.collapsed));
		}));
		this._register(DOM.addStandardDisposableListener(this.element, DOM.EventType.KEY_DOWN, e => {
			const focused = this.tree.getFocus()[0];
			if (!focused || !isHeaderRow(focused)) {
				return;
			}
			if (e.equals(KeyCode.F2)) {
				const rowElement = this.getRowElement(focused);
				if (rowElement) {
					e.preventDefault();
					this.delegate.editHeader(focused, rowElement);
				}
			} else if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
				e.preventDefault();
				this.toggle(focused);
			}
		}));

		this._register(autorun(reader => {
			const state = this.model.state.read(reader);
			const collectionId = this.options.collectionId.read(reader);
			this.options.density.read(reader);
			this.tree.setChildren(null, buildMockRows(state, collectionId, this.options.scheme));
		}));
		this._register(autorun(reader => {
			this.element.classList.toggle('compact', this.options.density.read(reader) === MockDensity.Compact);
		}));
	}

	layout(height: number, width: number): void {
		this.tree.layout(height, width);
	}

	focus(): void {
		this.tree.domFocus();
	}

	openFind(): void {
		this.tree.openFind();
	}

	/** Selects and focuses a session row without opening it. */
	reveal(sessionId: string): void {
		const row = this.findRow(r => r.kind === MockRowKind.Session && r.session.id === sessionId);
		if (row) {
			this.tree.reveal(row);
			this.tree.setFocus([row]);
			this.tree.setSelection([row]);
		}
	}

	clearSelection(): void {
		this.tree.setSelection([]);
	}

	/** The rendered header of a group or section, for anchoring popovers. */
	getHeaderElement(key: string): HTMLElement | undefined {
		const row = this.findRow(r => (r.kind === MockRowKind.Group && r.key === key) || (r.kind === MockRowKind.Section && r.sectionKey === key));
		return row ? this.getRowElement(row) : undefined;
	}

	private getRowElement(row: MockRow): HTMLElement | undefined {
		for (const element of this.element.querySelectorAll<HTMLElement>('.cg-row')) {
			if (element.dataset.cgId === row.id) {
				return element.querySelector<HTMLElement>('.cg-pill, .session-section') ?? element;
			}
		}
		return undefined;
	}

	private findRow(predicate: (row: MockRow) => boolean): MockRow | undefined {
		const visit = (node: ITreeNode<MockRow | null, FuzzyScore>): MockRow | undefined => {
			if (node.element && predicate(node.element)) {
				return node.element;
			}
			for (const child of node.children) {
				const found = visit(child as ITreeNode<MockRow | null, FuzzyScore>);
				if (found) {
					return found;
				}
			}
			return undefined;
		};
		return visit(this.tree.getNode(null) as ITreeNode<MockRow | null, FuzzyScore>);
	}

	private toggle(row: IMockSectionRow | IMockGroupRow): void {
		this.setCollapsed(row, !row.collapsed);
	}

	private setCollapsed(row: IMockSectionRow | IMockGroupRow, collapsed: boolean): void {
		const collectionId = this.options.collectionId.get();
		if (row.kind === MockRowKind.Group && row.groupId) {
			this.model.toggleGroupCollapsed(row.groupId, collapsed);
		} else {
			this.model.setSectionCollapsed(collectionId, row.kind === MockRowKind.Group ? row.key : row.sectionKey, collapsed);
		}
	}

	private newSession(row: IMockSectionRow | IMockGroupRow): void {
		this.delegate.newSession({ groupId: row.kind === MockRowKind.Group ? row.groupId : undefined, workspace: row.workspace });
	}

	private selectedSessionIds(row: IMockSessionRow): string[] {
		const selection = this.tree.getSelection().filter((r): r is IMockSessionRow => !!r && isSessionRow(r));
		return selection.some(r => r.session.id === row.session.id) ? selection.map(r => r.session.id) : [row.session.id];
	}

	private showContextMenu(row: MockRow, anchor: HTMLElement | { x: number; y: number }): void {
		const actions = this.getContextActions(row);
		if (!actions.length) {
			return;
		}
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
		});
	}

	private getContextActions(row: MockRow): IAction[] {
		const state = this.model.current;
		const collectionId = this.options.collectionId.get();
		const groupsHere = state.groups.filter(g => g.collectionId === collectionId);

		if (row.kind === MockRowKind.Session) {
			const session = row.session;
			const ids = this.selectedSessionIds(row);
			const addToGroup = new SubmenuAction('cg.addToGroup', ids.length > 1 ? `Add ${ids.length} Sessions to Group` : 'Add to Group', [
				new Action('cg.newGroup', 'New Group', undefined, true, async () => {
					const groupId = this.model.createGroup(collectionId, { sessionIds: ids, afterSection: session.groupId ? groupKey(session.groupId) : undefined });
					this.editGroupAfterRender(groupId);
				}),
				new Separator(),
				...groupsHere.map(group => {
					const action = new Action(`cg.addTo.${group.id}`, group.name, undefined, group.id !== session.groupId, async () => this.model.addSessionsToGroup(ids, group.id));
					action.checked = group.id === session.groupId;
					return action;
				}),
			]);
			const result: IAction[] = [
				new Action('cg.open', 'Open', undefined, true, async () => this.delegate.openSession(session.id)),
				new Separator(),
				addToGroup,
			];
			if (session.groupId) {
				result.push(new Action('cg.removeFromGroup', 'Remove from Group', undefined, true, async () => this.model.removeSessionsFromGroup(ids)));
			}
			result.push(new SubmenuAction('cg.moveToCollection', 'Move to Collection', this.delegate.buildMoveToCollectionActions(target => this.model.moveSessionsToCollection(ids, target), collectionId)));
			result.push(new Separator());
			result.push(new Action('cg.pin', session.pinned ? 'Unpin' : 'Pin', undefined, !session.archived, async () => this.model.setPinned(ids, !session.pinned)));
			result.push(new Action('cg.done', session.archived ? 'Restore' : 'Mark as Done', undefined, true, async () => this.model.setArchived(ids, !session.archived)));
			return result;
		}

		if (row.kind === MockRowKind.Group) {
			const anchor = () => this.getHeaderElement(row.key) ?? this.element;
			if (row.builtIn) {
				const section = row.builtIn;
				return [
					new Action('cg.editSection', 'Edit Section Color…', undefined, true, async () => this.delegate.editHeader(row, anchor())),
					new Action('cg.removeColor', 'Remove Color', undefined, true, async () => this.model.setBuiltInSectionColor(section, undefined)),
					new Action('cg.toggle', row.collapsed ? 'Expand Section' : 'Collapse Section', undefined, true, async () => this.toggle(row)),
				];
			}
			if (row.groupId) {
				const groupId = row.groupId;
				return [
					new Action('cg.editGroup', 'Edit Group…', undefined, true, async () => this.delegate.editHeader(row, anchor())),
					new Action('cg.newSessionInGroup', 'New Session in Group', undefined, true, async () => this.newSession(row)),
					new Action('cg.toggle', row.collapsed ? 'Expand Group' : 'Collapse Group', undefined, true, async () => this.toggle(row)),
					new Separator(),
					new SubmenuAction('cg.moveGroup', 'Move Group to Collection', this.delegate.buildMoveToCollectionActions(target => this.model.moveGroupToCollection(groupId, target), collectionId)),
					new Separator(),
					new Action('cg.ungroup', 'Ungroup', undefined, true, async () => this.model.ungroup(groupId)),
					new Action('cg.closeGroup', 'Mark Group as Done', undefined, true, async () => this.model.closeGroup(groupId)),
				];
			}
			const workspace = row.workspace!;
			return [
				new Action('cg.editWorkspace', 'Edit Workspace Color…', undefined, true, async () => this.delegate.editHeader(row, anchor())),
				new Action('cg.removeColor', 'Remove Color', undefined, true, async () => this.model.setWorkspaceColor(workspace, undefined)),
				new Action('cg.newSession', 'New Session', undefined, true, async () => this.newSession(row)),
				new Separator(),
				new SubmenuAction('cg.moveWorkspace', 'Move Workspace to Collection', this.delegate.buildMoveToCollectionActions(target => this.model.moveWorkspaceToCollection(collectionId, workspace, target), collectionId)),
			];
		}

		if (row.kind === MockRowKind.Section && row.workspace) {
			const workspace = row.workspace;
			return [
				new Action('cg.colorWorkspace', 'Color Workspace…', undefined, true, async () => this.delegate.editHeader(row, this.getHeaderElement(row.sectionKey) ?? this.element)),
				new Action('cg.newSession', 'New Session', undefined, true, async () => this.newSession(row)),
				new Action('cg.groupWorkspace', 'Convert to Group', undefined, true, async () => {
					const groupId = this.model.createGroup(collectionId, { name: workspace, sessionIds: row.sessions.map(s => s.id), afterSection: workspaceKey(workspace) });
					this.editGroupAfterRender(groupId);
				}),
				new Separator(),
				new SubmenuAction('cg.moveWorkspace', 'Move Workspace to Collection', this.delegate.buildMoveToCollectionActions(target => this.model.moveWorkspaceToCollection(collectionId, workspace, target), collectionId)),
			];
		}

		if (row.kind === MockRowKind.Section && row.builtIn) {
			return [
				new Action('cg.colorSection', 'Color Section…', undefined, true, async () => this.delegate.editHeader(row, this.getHeaderElement(row.sectionKey) ?? this.element)),
				new Action('cg.toggle', row.collapsed ? 'Expand Section' : 'Collapse Section', undefined, true, async () => this.toggle(row)),
			];
		}
		return [];
	}

	/** Opens the editor for a just-created group once its header is rendered. */
	editGroupAfterRender(groupId: string): void {
		const key = groupKey(groupId);
		const row = this.findRow(r => r.kind === MockRowKind.Group && r.key === key);
		if (!row || row.kind !== MockRowKind.Group) {
			return;
		}
		this.tree.reveal(row);
		this.tree.setFocus([row]);
		this.pendingEdit.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.element), () => {
			const element = this.getHeaderElement(key);
			if (element) {
				this.delegate.editHeader(row, element);
			}
		});
	}
}

function isHeaderRow(row: MockRow): row is IMockGroupRow | IMockSectionRow {
	return row.kind === MockRowKind.Group || row.kind === MockRowKind.Section;
}

//#endregion
