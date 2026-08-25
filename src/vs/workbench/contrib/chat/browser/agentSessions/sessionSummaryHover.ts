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
	/**
	 * Localized name of the pull request's state, e.g. "Merged pull request".
	 * The state is otherwise conveyed only by the icon's shape and color, so this
	 * is what a screen reader announces; omitted when the state is unresolved.
	 */
	readonly stateLabel?: string;
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
}

/**
 * The hover shown for a session, wherever a session is surfaced: rows in the
 * Agents window sessions list, and `agent-host-session://` pills in chat output.
 *
 * Owns the whole presentation — icons, the ordering of rows, the separators and
 * the muted provider footer — so every surface shows the same thing. Sections
 * hide themselves when they have nothing to show, and a rule is drawn only
 * between the sections that remain. Callers supply data through {@link update}
 * and place {@link domNode}; the widget is pure DOM and holds no listeners, so
 * it needs no disposal.
 */
export class SessionSummaryHoverWidget {

	readonly domNode: HTMLElement;

	private readonly _title: HTMLElement;
	private readonly _location: HTMLElement;
	private readonly _pullRequests: HTMLElement;
	private readonly _provider: HTMLElement;

	constructor(data?: ISessionSummaryHoverData) {
		this.domNode = dom.$('.session-summary-hover');
		this._title = dom.append(this.domNode, dom.$('.session-summary-hover-title'));
		this._location = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-location'));
		this._pullRequests = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-pull-requests'));
		this._provider = dom.append(this.domNode, dom.$('.session-summary-hover-section.session-summary-hover-provider'));
		// Both blocks are lists of facts, and the role is also what lets their rows
		// be named: `aria-label` is ignored on a generic element, but honoured on a
		// `listitem` (see `_appendRow`).
		this._location.setAttribute('role', 'list');
		this._pullRequests.setAttribute('role', 'list');
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
			this._appendRow(this._pullRequests, pullRequest.icon ?? Codicon.gitPullRequest, pullRequest.title, undefined, pullRequest.stateLabel
				? localize('sessionSummaryHover.pullRequestAriaLabel', "{0}: {1}", pullRequest.stateLabel, pullRequest.title)
				: undefined);
		}
		this._pullRequests.classList.toggle('hidden', !this._pullRequests.hasChildNodes());

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
			const files = changes
				? changes.files === 1
					? localize('sessionSummaryHover.fileChanged', "1 file changed")
					: localize('sessionSummaryHover.filesChanged', "{0} files changed", changes.files)
				: undefined;

			// Visually the branch icon marks the name as a branch and the counts
			// read as coloured +/- pairs; neither survives as speech, so the row
			// spells both out for screen readers.
			let ariaLabel: string | undefined;
			if (location.branch && changes && files) {
				ariaLabel = localize('sessionSummaryHover.branchAndChangesAriaLabel', "Branch {0}, {1}, {2} insertions, {3} deletions", location.branch, files, changes.insertions, changes.deletions);
			} else if (location.branch) {
				ariaLabel = localize('sessionSummaryHover.branchAriaLabel', "Branch {0}", location.branch);
			} else if (changes && files) {
				ariaLabel = localize('sessionSummaryHover.changesAriaLabel', "{0}, {1} insertions, {2} deletions", files, changes.insertions, changes.deletions);
			}

			const text = this._appendRow(this._location, location.branch ? Codicon.gitBranch : Codicon.diffMultiple, location.branch, undefined, ariaLabel);
			if (changes && files) {
				if (location.branch) {
					appendSeparator(text);
				}
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
	 *
	 * The icon is decorative: it duplicates or qualifies the row's text and is
	 * hidden from the accessibility tree. Where the icon is the *only* thing
	 * carrying meaning (a pull request's state, a name being a branch), callers
	 * pass an `ariaLabel` that spells it out instead — which the `listitem` role
	 * makes effective, since a generic element cannot be named by its author.
	 */
	private _appendRow(parent: HTMLElement, icon: ThemeIcon, label?: string, detail?: string, ariaLabel?: string): HTMLElement {
		const row = dom.append(parent, dom.$('.session-summary-hover-row'));
		row.setAttribute('role', 'listitem');
		const iconElement = dom.append(row, renderIcon(icon));
		iconElement.classList.add('session-summary-hover-icon');
		iconElement.setAttribute('aria-hidden', 'true');
		if (icon.color) {
			iconElement.style.color = asCssVariable(icon.color.id);
		}
		if (ariaLabel) {
			row.setAttribute('aria-label', ariaLabel);
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
