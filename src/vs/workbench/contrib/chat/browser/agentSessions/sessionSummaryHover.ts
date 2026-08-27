/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
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
	 * Session type and provider, most specific first, rendered as
	 * "Claude · Local Agent Host".
	 */
	readonly providerLabels?: readonly string[];
	/** Session that created this session, when available. */
	readonly createdBy?: {
		readonly title: string;
		readonly onOpen: () => void;
	};
}

/**
 * The hover shown for a session, wherever a session is surfaced: rows in the
 * Agents window sessions list, and `agent-host-session://` pills in chat output.
 *
 * Owns the whole presentation — icons, the ordering of rows, the separators and
 * the muted provider footer — so every surface shows the same thing. Callers
 * supply data through {@link update} and place {@link domNode}; the widget is
 * pure DOM and holds no listeners, so it needs no disposal.
 */
export class SessionSummaryHoverWidget {

	readonly domNode: HTMLElement;

	private readonly _title: HTMLElement;
	private readonly _location: HTMLElement;
	private readonly _pullRequests: HTMLElement;
	private readonly _createdBy: HTMLElement;
	private readonly _provider: HTMLElement;

	constructor(data?: ISessionSummaryHoverData) {
		this.domNode = dom.$('.session-summary-hover');
		this._title = dom.append(this.domNode, dom.$('.session-summary-hover-title'));
		this._location = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-location'));
		this._pullRequests = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-pull-requests'));
		this._createdBy = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-created-by'));
		this._provider = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-provider'));
		if (data) {
			this.update(data);
		}
	}

	update(data: ISessionSummaryHoverData): void {
		this._title.textContent = data.title;

		dom.clearNode(this._location);
		this._renderLocation(data.location);
		this._location.classList.toggle('hidden', !this._location.hasChildNodes());

		dom.clearNode(this._pullRequests);
		for (const pullRequest of data.pullRequests ?? []) {
			this._appendRow(this._pullRequests, pullRequest.icon ?? Codicon.gitPullRequest, pullRequest.title);
		}
		this._pullRequests.classList.toggle('hidden', !this._pullRequests.hasChildNodes());

		dom.clearNode(this._createdBy);
		if (data.createdBy) {
			const button = dom.append(this._createdBy, dom.$<HTMLButtonElement>('button.session-summary-hover-row.session-summary-hover-link'));
			button.type = 'button';
			button.onclick = data.createdBy.onOpen;
			this._appendRowContent(button, Codicon.reply, localize('sessionSummaryHover.createdBy', "Created by"), data.createdBy.title);
		}
		this._createdBy.classList.toggle('hidden', !this._createdBy.hasChildNodes());

		dom.clearNode(this._provider);
		if (data.providerLabels?.length) {
			dom.append(this._provider, dom.$('.session-summary-hover-row', undefined, data.providerLabels.join(SEPARATOR)));
		}
		this._provider.classList.toggle('hidden', !this._provider.hasChildNodes());
	}

	private _renderLocation(location: ISessionSummaryHoverLocation | undefined): void {
		if (!location) {
			return;
		}

		if (location.workspace) {
			this._appendRow(this._location, location.workspaceIcon ?? Codicon.folder, location.workspace);
		}

		// A worktree is named explicitly: an isolated checkout is the single most
		// consequential thing to know about where a session's edits land.
		if (location.worktreePending) {
			this._appendRow(this._location, Codicon.worktree, localize('sessionSummaryHover.worktreePending', "Creating worktree…"));
		} else if (location.worktree) {
			this._appendRow(this._location, Codicon.worktree, localize('sessionSummaryHover.worktree', "Worktree"), location.worktree);
		}

		const changes = location.changes;
		if (location.branch || changes) {
			const text = this._appendRow(this._location, location.branch ? Codicon.gitBranch : Codicon.diffMultiple, location.branch);
			if (changes) {
				if (location.branch) {
					appendSeparator(text);
				}
				const files = changes.files === 1
					? localize('sessionSummaryHover.fileChanged', "1 file changed")
					: localize('sessionSummaryHover.filesChanged', "{0} files changed", changes.files);
				dom.append(text, dom.$('span.session-summary-hover-detail', undefined, files));
				appendCount(text, 'session-summary-hover-insertions', chatLinesAddedForeground, `+${changes.insertions}`);
				appendCount(text, 'session-summary-hover-deletions', chatLinesRemovedForeground, `-${changes.deletions}`);
			}
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
