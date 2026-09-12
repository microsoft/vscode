/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { chatLinesAddedForeground, chatLinesRemovedForeground } from '../../common/widget/chatColors.js';
import './media/sessionSummaryHover.css';

/**
 * Where a session does its work: the workspace it belongs to, the isolated
 * worktree it checked out (if any) and the branch it is on.
 */
export interface ISessionSummaryHoverLocation {
	/** Workspace path, or a repository label for workspaces with no local path. */
	readonly workspace?: string;
	/** Icon for {@link workspace}. Defaults to a folder. */
	readonly workspaceIcon?: ThemeIcon;
	/** Path of the session's isolated worktree, when it runs in one. */
	readonly worktree?: string;
	/** Whether the worktree is still being created, so it has no path yet. */
	readonly worktreePending?: boolean;
	/** Branch the session is working on. */
	readonly branch?: string;
	/** Aggregated pending changes. Omitted when the session has none. */
	readonly changes?: {
		readonly files: number;
		readonly insertions: number;
		readonly deletions: number;
	};
}

/** A pull request produced by a session. */
export interface ISessionSummaryHoverPullRequest {
	/** Pull request title, or a `#123`-style fallback when the title is unknown. */
	readonly title: string;
	/** Icon carrying the pull request's state (and its color). */
	readonly icon?: ThemeIcon;
	/**
	 * Where the pull request lives. Together with {@link onOpen} it makes the row
	 * a real link, so it is announced as one and offers a link's affordances
	 * (copying the target, opening it in a new tab).
	 */
	readonly uri?: URI;
	/**
	 * Opens the pull request. Activation is routed through this rather than the
	 * anchor's own navigation, so it goes through the opener service instead of
	 * navigating the window {@link uri} is rendered in.
	 */
	readonly onOpen?: () => void;
}

/**
 * Everything the session hover shows, in a provider-neutral shape.
 *
 * Each window populates this from its own data source — the Agents window from
 * an `ISession`, the editor window from an `IChatSessionItem` — so the widget
 * stays free of both. Every field except {@link title} is optional: a data
 * source that cannot answer omits it and the corresponding row disappears.
 */
export interface ISessionSummaryHoverData {
	readonly title: string;
	readonly location?: ISessionSummaryHoverLocation;
	/**
	 * Pull requests this session produced. Pull requests inherited from the
	 * checkout it started from do not belong here — they are not its work.
	 */
	readonly pullRequests?: readonly ISessionSummaryHoverPullRequest[];
	/**
	 * The kind of agent serving the session, e.g. "Claude", shown beside the
	 * title as "Fix the redirect loop · Claude".
	 */
	readonly providerLabel?: string;
	/** Session that created this session, when available. */
	readonly createdBy?: {
		readonly title: string;
		readonly onOpen: () => void;
	};
	/**
	 * Set when the session was created in another application. The row names
	 * that origin and, when activated, leads to whatever controls whether such
	 * sessions are shown here.
	 */
	readonly externalSession?: {
		readonly onOpen: () => void;
	};
}

/**
 * The hover shown for a session, wherever a session is surfaced: rows in the
 * Agents window sessions list, and `agent-host-session://` pills in chat output.
 *
 * Owns the whole presentation — icons, the ordering of rows and the separators —
 * so every surface shows the same thing. Callers supply data through
 * {@link update} and place {@link domNode}; the widget is pure DOM and holds no
 * listeners, so it needs no disposal.
 */
export class SessionSummaryHoverWidget {

	readonly domNode: HTMLElement;

	private readonly _title: HTMLElement;
	private readonly _location: HTMLElement;
	private readonly _pullRequests: HTMLElement;
	private readonly _createdBy: HTMLElement;
	private readonly _externalSession: HTMLElement;

	constructor(data?: ISessionSummaryHoverData) {
		this.domNode = dom.$('.session-summary-hover');
		this._title = dom.append(this.domNode, dom.$('.session-summary-hover-title'));
		this._location = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-location'));
		this._pullRequests = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-pull-requests'));
		this._createdBy = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-created-by'));
		this._externalSession = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-external-session'));
		if (data) {
			this.update(data);
		}
	}

	update(data: ISessionSummaryHoverData): void {
		dom.clearNode(this._title);
		dom.append(this._title, dom.$('span.session-summary-hover-title-text', undefined, data.title));
		// The agent is part of the session's identity, so it reads on the title
		// line rather than as a footnote below everything else.
		if (data.providerLabel) {
			appendSeparator(this._title);
			dom.append(this._title, dom.$('span.session-summary-hover-provider', undefined, data.providerLabel));
		}

		dom.clearNode(this._location);
		this._renderLocation(data.location);
		this._location.classList.toggle('hidden', !this._location.hasChildNodes());

		dom.clearNode(this._pullRequests);
		for (const pullRequest of data.pullRequests ?? []) {
			const icon = pullRequest.icon ?? Codicon.gitPullRequest;
			if (pullRequest.uri && pullRequest.onOpen) {
				this._appendLinkRow(this._pullRequests, icon, pullRequest.uri, pullRequest.onOpen, pullRequest.title);
			} else {
				this._appendRow(this._pullRequests, icon, pullRequest.title);
			}
		}
		this._pullRequests.classList.toggle('hidden', !this._pullRequests.hasChildNodes());

		dom.clearNode(this._createdBy);
		if (data.createdBy) {
			this._appendButtonRow(this._createdBy, Codicon.reply, data.createdBy.onOpen, localize('sessionSummaryHover.createdBy', "Created by"), data.createdBy.title);
		}
		this._createdBy.classList.toggle('hidden', !this._createdBy.hasChildNodes());

		// Where the session came from rather than what it is doing, so it closes
		// the hover below everything the session itself has to say.
		dom.clearNode(this._externalSession);
		if (data.externalSession) {
			this._appendButtonRow(this._externalSession, Codicon.multipleWindows, data.externalSession.onOpen, localize('sessionSummaryHover.externalSession', "External Session"));
		}
		this._externalSession.classList.toggle('hidden', !this._externalSession.hasChildNodes());
	}

	private _renderLocation(location: ISessionSummaryHoverLocation | undefined): void {
		if (!location) {
			return;
		}

		// Each row names what it is before showing it, so the block reads as a
		// list of facts about the session rather than a stack of bare paths. The
		// name carries the emphasis; the value it names stays muted behind it.
		if (location.workspace) {
			this._appendRow(this._location, location.workspaceIcon ?? Codicon.folder, localize('sessionSummaryHover.workspace', "Workspace"), location.workspace);
		}

		if (location.worktreePending) {
			this._appendRow(this._location, Codicon.worktree, localize('sessionSummaryHover.worktree', "Worktree"), localize('sessionSummaryHover.worktreeCreating', "Creating…"));
		} else if (location.worktree) {
			this._appendRow(this._location, Codicon.worktree, localize('sessionSummaryHover.worktree', "Worktree"), location.worktree);
		}

		if (location.branch) {
			this._appendRow(this._location, Codicon.gitBranch, localize('sessionSummaryHover.branch', "Branch"), location.branch);
		}

		// Changes name themselves, so they take no separate label.
		const changes = location.changes;
		if (changes) {
			const files = changes.files === 1
				? localize('sessionSummaryHover.fileChanged', "1 file changed")
				: localize('sessionSummaryHover.filesChanged', "{0} files changed", changes.files);
			const text = this._appendRow(this._location, Codicon.diffMultiple, files);
			appendCount(text, 'session-summary-hover-insertions', chatLinesAddedForeground, `+${changes.insertions}`);
			appendCount(text, 'session-summary-hover-deletions', chatLinesRemovedForeground, `-${changes.deletions}`);
		}
	}

	/**
	 * A row of `icon label [· detail]`, returning the inline text container so
	 * callers can append further inline content. The icon keeps its theme color,
	 * so a merged pull request reads as merged at a glance.
	 */
	private _appendRow(parent: HTMLElement, icon: ThemeIcon, label?: string, detail?: string): HTMLElement {
		const row = dom.append(parent, dom.$('.session-summary-hover-row'));
		return this._appendRowContent(row, icon, label, detail);
	}

	/**
	 * A row that navigates somewhere: a real anchor, so assistive technology
	 * announces a link and the usual affordances (copy the target, open it in a
	 * new tab) are available. Activation is handled rather than left to the
	 * anchor, so the target is opened through the caller's opener service
	 * instead of navigating the window the hover is shown in.
	 */
	private _appendLinkRow(parent: HTMLElement, icon: ThemeIcon, uri: URI, onOpen: () => void, label?: string, detail?: string): HTMLElement {
		const link = dom.append(parent, dom.$<HTMLAnchorElement>('a.session-summary-hover-row.session-summary-hover-link'));
		link.href = uri.toString();
		link.onclick = event => {
			dom.EventHelper.stop(event, true);
			onOpen();
		};
		return this._appendRowContent(link, icon, label, detail);
	}

	/** A row that runs an in-app action, so it has no target to link to. */
	private _appendButtonRow(parent: HTMLElement, icon: ThemeIcon, onOpen: () => void, label?: string, detail?: string): HTMLElement {
		const button = dom.append(parent, dom.$<HTMLButtonElement>('button.session-summary-hover-row.session-summary-hover-link'));
		button.type = 'button';
		button.onclick = onOpen;
		return this._appendRowContent(button, icon, label, detail);
	}

	private _appendRowContent(row: HTMLElement, icon: ThemeIcon, label?: string, detail?: string): HTMLElement {
		const iconElement = dom.append(row, renderIcon(icon));
		iconElement.classList.add('session-summary-hover-icon');
		if (icon.color) {
			iconElement.style.color = asCssVariable(icon.color.id);
		}
		const text = dom.append(row, dom.$('span.session-summary-hover-text'));
		if (label) {
			dom.append(text, dom.$('span', undefined, label));
		}
		if (detail) {
			appendSeparator(text);
			dom.append(text, dom.$('span.session-summary-hover-detail', undefined, detail));
		}
		return text;
	}
}

/** Joins values inside a single hover row. */
const SEPARATOR = ' · ';

function appendSeparator(parent: HTMLElement): void {
	dom.append(parent, dom.$('span.session-summary-hover-separator', undefined, SEPARATOR));
}

function appendCount(parent: HTMLElement, className: string, colorId: string, text: string): void {
	const element = dom.append(parent, dom.$(`span.${className}`, undefined, text));
	element.style.color = asCssVariable(colorId);
}
