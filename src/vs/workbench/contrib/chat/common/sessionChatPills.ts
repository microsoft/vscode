/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { observableMemento, ObservableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import type { ChatPullRequestState } from '../../../common/chatPullRequest.js';

/** The kinds of pill shown above an agent chat input, each independently hideable. */
export const enum SessionChatPillKind {
	Changes = 'changes',
	Artifacts = 'artifacts',
	References = 'references',
	Customizations = 'customizations',
	PullRequests = 'pullRequests',
	Issues = 'issues',
	Browsers = 'browsers',
	Subagents = 'subagents',
}

/** All pill kinds, in the order they are offered in the visibility menu. */
export const SESSION_CHAT_PILL_KINDS: readonly SessionChatPillKind[] = [
	SessionChatPillKind.Changes,
	SessionChatPillKind.PullRequests,
	SessionChatPillKind.Issues,
	SessionChatPillKind.Artifacts,
	SessionChatPillKind.References,
	SessionChatPillKind.Customizations,
	SessionChatPillKind.Browsers,
	SessionChatPillKind.Subagents,
];

export function getSessionChatPillLabel(kind: SessionChatPillKind): string {
	switch (kind) {
		case SessionChatPillKind.Changes: return localize('sessionChatPills.changes', "Changes");
		case SessionChatPillKind.Artifacts: return localize('sessionChatPills.artifacts', "Artifacts");
		case SessionChatPillKind.References: return localize('sessionChatPills.references', "References");
		case SessionChatPillKind.Customizations: return localize('sessionChatPills.customizations', "Customizations");
		case SessionChatPillKind.PullRequests: return localize('sessionChatPills.pullRequests', "Pull Requests");
		case SessionChatPillKind.Issues: return localize('sessionChatPills.issues', "Issues");
		case SessionChatPillKind.Browsers: return localize('sessionChatPills.browsers', "Browsers");
		case SessionChatPillKind.Subagents: return localize('sessionChatPills.subagents', "Subagents");
	}
}

/**
 * Whether the user can hide a pill. Changes reports what the turn did to the
 * user's files, so it always shows once it has data.
 */
export function isSessionChatPillHideable(kind: SessionChatPillKind): boolean {
	return kind !== SessionChatPillKind.Changes;
}

/** One entry of the pill visibility context menu. */
export interface ISessionChatPillMenuEntry {
	readonly kind: SessionChatPillKind;
	readonly label: string;
	/** Whether the pill shows when it has data. */
	readonly checked: boolean;
}

/**
 * The pill visibility context menu: an optional "Hide X" for the pill that was
 * right-clicked, then the kinds the surface has data for, then the rest. The
 * caller renders a separator between the groups it shows.
 */
export interface ISessionChatPillMenu {
	readonly hide?: { readonly kind: SessionChatPillKind; readonly label: string };
	readonly withData: readonly ISessionChatPillMenuEntry[];
	readonly withoutData: readonly ISessionChatPillMenuEntry[];
}

/**
 * Builds the visibility menu. Every offered, hideable kind is listed and
 * toggleable, checked while it is not hidden, and grouped by whether the
 * current session has data for it.
 */
export function getSessionChatPillMenu(
	kindsWithData: ReadonlySet<SessionChatPillKind>,
	hiddenKinds: ReadonlySet<SessionChatPillKind>,
	targetKind?: SessionChatPillKind,
	offeredKinds: readonly SessionChatPillKind[] = SESSION_CHAT_PILL_KINDS,
): ISessionChatPillMenu {
	const offered = new Set(offeredKinds);
	const withData: ISessionChatPillMenuEntry[] = [];
	const withoutData: ISessionChatPillMenuEntry[] = [];
	for (const kind of SESSION_CHAT_PILL_KINDS) {
		if (!offered.has(kind) || !isSessionChatPillHideable(kind)) {
			continue;
		}
		(kindsWithData.has(kind) ? withData : withoutData).push({
			kind,
			label: getSessionChatPillLabel(kind),
			checked: !hiddenKinds.has(kind),
		});
	}

	const hide = targetKind !== undefined && offeredKinds.includes(targetKind) && isSessionChatPillHideable(targetKind)
		? { kind: targetKind, label: localize('sessionChatPills.hide', "Hide {0}", getSessionChatPillLabel(targetKind)) }
		: undefined;

	return { ...(hide ? { hide } : {}), withData, withoutData };
}

/**
 * Pills hidden until the user turns them on: useful but noisy enough that they
 * should not claim room in the row by default.
 */
const defaultHiddenKinds: readonly SessionChatPillKind[] = [
	SessionChatPillKind.Customizations,
	SessionChatPillKind.Subagents,
];

const hiddenSessionChatPills = observableMemento<readonly string[]>({
	defaultValue: defaultHiddenKinds,
	key: 'sessions.chatPills.hidden',
	toStorage: kinds => JSON.stringify(kinds),
	fromStorage: value => {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((kind): kind is string => typeof kind === 'string') : [];
	},
});

const showAllSessionPullRequests = observableMemento<boolean>({
	defaultValue: true,
	key: 'sessions.chatPills.pullRequests.showAll',
	toStorage: value => String(value),
	fromStorage: value => value !== 'false',
});

export const ISessionChatPillVisibilityService = createDecorator<ISessionChatPillVisibilityService>('sessionChatPillVisibilityService');

export interface ISessionChatPillVisibilityService {
	readonly _serviceBrand: undefined;
	readonly pullRequests: {
		readonly showAll: IObservable<boolean>;
		isVisible(state: ChatPullRequestState | undefined, reader: IReader | undefined): boolean;
		setShowAll(showAll: boolean): void;
	};
	readHiddenKinds(reader: IReader | undefined): ReadonlySet<SessionChatPillKind>;
	isVisible(kind: SessionChatPillKind, reader: IReader | undefined): boolean;
	hide(kind: SessionChatPillKind): void;
	toggle(kind: SessionChatPillKind): void;
}

/** The user's per-kind pill visibility choices, persisted across windows. */
export class SessionChatPillVisibility extends Disposable implements ISessionChatPillVisibilityService {

	declare readonly _serviceBrand: undefined;

	readonly pullRequests: ISessionChatPillVisibilityService['pullRequests'];

	private readonly _hiddenKinds: ObservableMemento<readonly string[]>;

	constructor(
		@IStorageService storageService: IStorageService,
	) {
		super();
		this._hiddenKinds = this._register(hiddenSessionChatPills(StorageScope.APPLICATION, StorageTarget.USER, storageService));
		const showAll = this._register(showAllSessionPullRequests(StorageScope.APPLICATION, StorageTarget.USER, storageService));
		this.pullRequests = {
			showAll,
			isVisible: (state, reader) => showAll.read(reader) || (state !== 'closed' && state !== 'merged'),
			setShowAll: value => showAll.set(value, undefined),
		};
	}

	readHiddenKinds(reader: IReader | undefined): ReadonlySet<SessionChatPillKind> {
		return new Set((this._hiddenKinds.read(reader) as readonly SessionChatPillKind[]).filter(isSessionChatPillHideable));
	}

	isVisible(kind: SessionChatPillKind, reader: IReader | undefined): boolean {
		return !isSessionChatPillHideable(kind) || !this._hiddenKinds.read(reader).includes(kind);
	}

	hide(kind: SessionChatPillKind): void {
		if (isSessionChatPillHideable(kind) && !this._hiddenKinds.get().includes(kind)) {
			this._hiddenKinds.set([...this._hiddenKinds.get(), kind], undefined);
		}
	}

	toggle(kind: SessionChatPillKind): void {
		if (!isSessionChatPillHideable(kind)) {
			return;
		}
		const hidden = this._hiddenKinds.get();
		this._hiddenKinds.set(hidden.includes(kind) ? hidden.filter(hiddenKind => hiddenKind !== kind) : [...hidden, kind], undefined);
	}
}
