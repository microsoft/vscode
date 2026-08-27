/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IReader } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { observableMemento, ObservableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/** The kinds of pill shown above the chat input, each independently hideable. */
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
	SessionChatPillKind.Artifacts,
	SessionChatPillKind.References,
	SessionChatPillKind.Customizations,
	SessionChatPillKind.PullRequests,
	SessionChatPillKind.Issues,
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
 * right-clicked, then the kinds the session has data for, then the rest. The
 * caller renders a separator between the groups it shows.
 */
export interface ISessionChatPillMenu {
	readonly hide?: { readonly kind: SessionChatPillKind; readonly label: string };
	readonly withData: readonly ISessionChatPillMenuEntry[];
	readonly withoutData: readonly ISessionChatPillMenuEntry[];
}

/**
 * Builds the visibility menu. Every hideable kind is listed and toggleable,
 * checked while it is not hidden, grouped by whether the session has data for it.
 *
 * @param targetKind The pill that was right-clicked, which gains a "Hide X"
 * entry. Omitted when the click did not land on a pill.
 */
export function getSessionChatPillMenu(
	kindsWithData: ReadonlySet<SessionChatPillKind>,
	hiddenKinds: ReadonlySet<SessionChatPillKind>,
	targetKind?: SessionChatPillKind,
): ISessionChatPillMenu {
	const withData: ISessionChatPillMenuEntry[] = [];
	const withoutData: ISessionChatPillMenuEntry[] = [];
	for (const kind of SESSION_CHAT_PILL_KINDS) {
		if (!isSessionChatPillHideable(kind)) {
			continue;
		}
		(kindsWithData.has(kind) ? withData : withoutData).push({
			kind,
			label: getSessionChatPillLabel(kind),
			checked: !hiddenKinds.has(kind),
		});
	}

	const hide = targetKind !== undefined && isSessionChatPillHideable(targetKind)
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

/** The user's per-kind pill visibility choices, persisted across windows. */
export class SessionChatPillVisibility extends Disposable {

	private readonly _hiddenKinds: ObservableMemento<readonly string[]>;

	constructor(
		@IStorageService storageService: IStorageService,
	) {
		super();
		this._hiddenKinds = this._register(hiddenSessionChatPills(StorageScope.APPLICATION, StorageTarget.USER, storageService));
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
