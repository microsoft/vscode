/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { arrayEqualsC, structuralEquals } from '../../../../../base/common/equals.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, derived, derivedObservableWithCache, derivedOpts, IObservable, mapObservableArrayCached, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { format } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ChangesetOperationTargetKind } from '../../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js';
import { ChangesetOperation, ChangesetOperationScope, type ChangesetFile, ChangesetOperationStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildDefaultChatUri, ChangesetStatus, Changeset, StateComponents, type ChangesetState, type ChatState, type ChatSummary, type SessionState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ISessionChangeset, ISessionChangesetCapabilities, ISessionChangesetOperation, ISessionChangesetOperationTarget, ISessionFileChange, SessionChangesetOperationScope, SessionChangesetOperationStatus, sessionFileChangesEqual } from '../../../../services/sessions/common/session.js';
import { changesetFileToChange } from './agentHostDiffs.js';
import { IAgentHostAdapterOptions } from './baseAgentHostSessionsProvider.js';

const enum ChangesetKind {
	Branch = 'branch',
	Uncommitted = 'uncommitted',
	Session = 'session',
	Turn = 'turn',
	Compare = 'compare-turns',
}

export function createChangesets(
	sessionUri: URI,
	options: IAgentHostAdapterOptions,
	isActiveSessionObs: IObservable<boolean>,
	changesets: readonly Changeset[] | undefined
): readonly ISessionChangeset[] {
	if (!changesets) {
		return [];
	}

	const sessionChangesets: ISessionChangeset[] = [];

	// Select the "Branch Changes" changeset as the default, if it exists; otherwise just the first one.
	const defaultChangeset = changesets.find(c => c.changeKind === ChangesetKind.Branch) ?? changesets[0];

	for (const changeset of changesets) {
		const isDefault = changeset === defaultChangeset;

		if (
			changeset.changeKind === ChangesetKind.Branch ||
			changeset.changeKind === ChangesetKind.Uncommitted ||
			changeset.changeKind === ChangesetKind.Session
		) {
			// Branch Changes, Uncommitted Changes, and Session Changes
			sessionChangesets.push(options.instantiationService.createInstance(AgentHostChangeset, options, isActiveSessionObs, {
				...changeset, isDefault
			}));
		} else if (changeset.changeKind === ChangesetKind.Turn) {
			// Last Turn Changes
			sessionChangesets.push(options.instantiationService.createInstance(AgentHostLastTurnChangeset, sessionUri, options, isActiveSessionObs, {
				...changeset, isDefault
			}));
		}
	}

	return sessionChangesets;
}

export function createActiveSessionSubscriptionObs<T>(
	options: IAgentHostAdapterOptions,
	isActiveSessionObs: IObservable<boolean>,
	component: StateComponents,
	resourceObs: IObservable<URI | undefined>,
): IObservable<IObservable<T | Error | undefined | null>> {
	return derived(reader => {
		const connection = options.getConnection();
		if (!connection) {
			return constObservable(null);
		}

		const resource = resourceObs.read(reader);
		if (!resource) {
			return constObservable(null);
		}

		const isActiveSession = isActiveSessionObs.read(reader);
		if (!isActiveSession) {
			return constObservable(null);
		}

		const subscriptionRef = connection.getSubscription(component, resource, 'AgentHostSessionChangesets');
		reader.store.add(subscriptionRef);

		return observableFromEvent(subscriptionRef.object.onDidChange,
			() => subscriptionRef.object.value as T | Error | undefined);
	});
}

/**
 * Selects the URI of the session's most recently modified chat — the one that
 * holds the session's "last turn". Falls back to the session's default chat (or
 * the synthesized default chat URI) when the state is absent/errored or no chat
 * is more recent.
 *
 * Shared by {@link AgentHostLastTurnChangeset} and the output-stream-derived
 * last-turn changes so the "Last Turn Changes" changeset and the chat input
 * status pills always resolve the same chat.
 */
export function selectMostRecentChatUri(sessionState: SessionState | Error | undefined | null, sessionUri: URI): URI {
	if (!sessionState || sessionState instanceof Error) {
		return URI.parse(buildDefaultChatUri(sessionUri));
	}

	// `modifiedAt` is ISO 8601, so lexicographic compare is chronological.
	const mostRecentChat = sessionState.chats.reduce<ChatSummary | undefined>(
		(best, c) => !best || c.modifiedAt > best.modifiedAt ? c : best,
		undefined
	);
	return URI.parse(mostRecentChat?.resource ?? sessionState.defaultChat ?? buildDefaultChatUri(sessionUri));
}

function toSessionChangesetOperationScope(scope: ChangesetOperationScope): SessionChangesetOperationScope {
	switch (scope) {
		case ChangesetOperationScope.Changeset: return SessionChangesetOperationScope.Changeset;
		case ChangesetOperationScope.Resource: return SessionChangesetOperationScope.Resource;
		case ChangesetOperationScope.Range: return SessionChangesetOperationScope.Range;
		default: throw new Error(`Unknown ChangesetOperationScope: ${scope}`);
	}
}

function toSessionChangesetOperationStatus(status: ChangesetOperationStatus): SessionChangesetOperationStatus {
	switch (status) {
		case ChangesetOperationStatus.Idle: return SessionChangesetOperationStatus.Idle;
		case ChangesetOperationStatus.Running: return SessionChangesetOperationStatus.Running;
		case ChangesetOperationStatus.Error: return SessionChangesetOperationStatus.Error;
		case ChangesetOperationStatus.Disabled: return SessionChangesetOperationStatus.Disabled;
		default: throw new Error(`Unknown ChangesetOperationStatus: ${status}`);
	}
}

function toSessionChangesetOperation(operation: ChangesetOperation): ISessionChangesetOperation {
	return {
		id: operation.id,
		label: operation.label,
		description: operation.description,
		icon: operation.icon
			? ThemeIcon.fromId(operation.icon)
			: undefined,
		group: operation.group,
		confirmation: operation.confirmation
			? typeof operation.confirmation === 'string'
				? operation.confirmation
				: new MarkdownString(operation.confirmation.markdown, {
					isTrusted: false, supportThemeIcons: true
				})
			: undefined,
		scopes: operation.scopes.map(toSessionChangesetOperationScope),
		status: toSessionChangesetOperationStatus(operation.status),
	};
}

abstract class AbstractAgentHostChangeset implements ISessionChangeset {
	abstract readonly id: string;
	abstract readonly label: string;
	abstract readonly description: string | undefined;

	abstract readonly isEnabled: IObservable<boolean>;
	abstract readonly isDefault: IObservable<boolean>;

	readonly originalCheckpointRef = observableValue(this, undefined);
	readonly modifiedCheckpointRef = observableValue(this, undefined);

	readonly isLoadingChanges: IObservable<boolean>;
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	readonly operations: IObservable<readonly ISessionChangesetOperation[]>;

	readonly capabilities: ISessionChangesetCapabilities;

	protected abstract readonly channelUriObs: IObservable<URI | undefined>;
	protected abstract readonly changesetStateObs: IObservable<IObservable<ChangesetState | Error | undefined | null>>;
	private readonly _changesetFilesObs: IObservable<readonly ChangesetFile[] | undefined>;

	constructor(
		changeset: Changeset,
		private readonly _options: IAgentHostAdapterOptions,
		private readonly _dialogService: IDialogService,
	) {
		this.capabilities = {
			review: changeset.capabilities?.review !== undefined
		} satisfies ISessionChangesetCapabilities;

		this.isLoadingChanges = derived(reader => {
			const changesetState = this.changesetStateObs.read(reader).read(reader);

			// If the changeset state is `undefined`, it means that the first snapshot
			// has not yet arrived, so in order to avoid any flickering in the Changes
			// view, we consider this temporary state as if the changes are still being
			// computed.
			if (changesetState === undefined) {
				return true;
			}

			if (changesetState === null || changesetState instanceof Error) {
				return false;
			}

			// For static changesets, that are persisted to the database, the
			// cached state will be sent over the wire while the changeset is
			// being computed.
			return changesetState.status === ChangesetStatus.Computing;
		});

		const mapDiffUri = this._options.mapDiffUri;

		// Hold the raw `ChangesetFile[]` (with last-value semantics) so unchanged
		// files keep their reference across reducer updates, enabling the
		// per-file cache below to skip rebuilding them.
		this._changesetFilesObs = derivedObservableWithCache<readonly ChangesetFile[] | undefined>(this, (reader, lastValue) => {
			const changesetState = this.changesetStateObs.read(reader).read(reader);
			if (changesetState === null || changesetState instanceof Error) {
				return [];
			}

			if (changesetState === undefined) {
				return lastValue;
			}

			// Render `state.files` when the changeset is `Ready`, or on the very
			// first arrival (the initial snapshot contains the file list persisted
			// from the previous session).
			if (changesetState.status !== ChangesetStatus.Ready && lastValue !== undefined) {
				return lastValue;
			}

			return changesetState.files;
		});

		// Build one change per file, reusing the cached result for files whose
		// `ChangesetFile` reference is unchanged so only changed files are
		// re-parsed and re-mapped.
		const mappedChangesObs = mapObservableArrayCached(this,
			this._changesetFilesObs.map(files => files ?? []),
			file => changesetFileToChange(file, mapDiffUri));

		const changesObs = derived<readonly ISessionFileChange[] | undefined>(this, reader => {
			return mappedChangesObs.read(reader).filter(isDefined);
		});

		this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, reader => {
			return changesObs.read(reader) ?? [];
		});

		const operationsObs = derivedObservableWithCache<readonly ISessionChangesetOperation[]>(this, (reader, lastValue) => {
			const changesetState = this.changesetStateObs.read(reader).read(reader);
			if (changesetState === null || changesetState instanceof Error) {
				return [];
			}

			if (changesetState === undefined) {
				return lastValue ?? [];
			}

			return changesetState.operations?.map(toSessionChangesetOperation) ?? [];
		});

		this.operations = derivedOpts({ equalsFn: arrayEqualsC(structuralEquals) }, reader => {
			return operationsObs.read(reader) ?? [];
		});
	}

	async invokeOperation(operationId: string, target?: ISessionChangesetOperationTarget): Promise<void> {
		const connection = this._options.getConnection();
		if (!connection) {
			return;
		}

		const channel = this.channelUriObs.get();
		if (!channel) {
			return;
		}

		const operation = this.operations.get().find(o => o.id === operationId);
		if (operation?.confirmation) {
			const message = typeof operation.confirmation === 'string'
				? operation.confirmation
				: operation.confirmation.value;
			const { confirmed } = await this._dialogService.confirm({
				type: 'warning',
				message: target?.kind === 'resource'
					? format(message, basename(target.resource))
					: message,
				primaryButton: operation.label,
			});
			if (!confirmed) {
				return;
			}
		}

		await connection.invokeChangesetOperation({
			operationId,
			channel: channel.toString(),
			target: target?.kind === 'resource'
				? {
					kind: ChangesetOperationTargetKind.Resource,
					resource: target.resource.toString()
				}
				: undefined,
		});
	}

	setReviewState(resources: readonly URI[], reviewed: boolean): void {
		if (!this.capabilities.review) {
			return;
		}

		const connection = this._options.getConnection();
		const channel = this.channelUriObs.get();
		if (!connection || !channel) {
			return;
		}

		const files = resources.map(resource => {
			const file = this._changesetFilesObs.get()?.find(candidate => {
				const change = changesetFileToChange(candidate, this._options.mapDiffUri);
				return isEqual(change?.modifiedUri, resource) || isEqual(change?.originalUri, resource);
			});
			if (!file) {
				throw new Error(`Resource '${resource.toString()}' is not part of changeset '${this.id}'`);
			}
			return file.id;
		});

		if (files.length === 0) {
			return;
		}

		connection.dispatch(channel.toString(), {
			type: ActionType.ChangesetFilesReviewChanged,
			files,
			reviewed,
		});
	}
}

class AgentHostChangeset extends AbstractAgentHostChangeset {
	readonly id: string;

	private _label: string;
	get label(): string { return this._label; }

	private _description?: string;
	get description(): string | undefined { return this._description; }

	readonly isEnabled = constObservable(true);
	readonly isDefault: IObservable<boolean>;

	protected override readonly channelUriObs: IObservable<URI | undefined>;
	protected override readonly changesetStateObs: IObservable<IObservable<ChangesetState | Error | undefined | null>>;

	constructor(
		options: IAgentHostAdapterOptions,
		isActiveSessionObs: IObservable<boolean>,
		changesetSummary: Changeset & { isDefault: boolean },
		@IDialogService dialogService: IDialogService,
	) {
		super(changesetSummary, options, dialogService);

		this.channelUriObs = constObservable(URI.parse(changesetSummary.uriTemplate));

		this.changesetStateObs = createActiveSessionSubscriptionObs<ChangesetState>(
			options,
			isActiveSessionObs,
			StateComponents.Changeset,
			this.channelUriObs,
		);

		this.id = changesetSummary.changeKind;
		this._label = changesetSummary.label;
		this._description = changesetSummary.description;

		this.isDefault = constObservable(changesetSummary.isDefault);
	}
}

class AgentHostLastTurnChangeset extends AbstractAgentHostChangeset {
	readonly id: string;
	readonly label = localize('lastTurnChanges', "Last Turn Changes");
	readonly description = localize('lastTurnChangesDescription', "Show only changes made in the last turn");

	readonly isDefault = observableValue(this, false);
	readonly isEnabled: IObservable<boolean>;

	protected override readonly channelUriObs: IObservable<URI | undefined>;
	protected readonly changesetStateObs: IObservable<IObservable<ChangesetState | Error | undefined | null>>;

	constructor(
		sessionUri: URI,
		options: IAgentHostAdapterOptions,
		isActiveSessionObs: IObservable<boolean>,
		changesetSummary: Changeset & { isDefault: boolean },
		@IDialogService dialogService: IDialogService,
	) {
		super(changesetSummary, options, dialogService);

		this.id = changesetSummary.changeKind;

		// Turns moved off the session and onto a per-chat channel with the
		// multi-chat protocol. Subscribe to the session to discover its
		// chats, then track the chat that was modified most recently — its
		// in-progress turn (or, when idle, its last completed turn) is the
		// session's "last turn".
		const sessionStateObs = createActiveSessionSubscriptionObs<SessionState>(
			options,
			isActiveSessionObs,
			StateComponents.Session,
			constObservable(sessionUri),
		);

		const mostRecentChatUriObs = derivedOpts({ equalsFn: isEqual }, reader => {
			const sessionState = sessionStateObs.read(reader).read(reader);
			return selectMostRecentChatUri(sessionState, sessionUri);
		});

		const chatStateObs = createActiveSessionSubscriptionObs<ChatState>(
			options,
			isActiveSessionObs,
			StateComponents.Chat,
			mostRecentChatUriObs,
		);

		const lastTurnIdObs = derived(reader => {
			const chatState = chatStateObs.read(reader).read(reader);
			if (!chatState || chatState instanceof Error) {
				return undefined;
			}
			// Prefer the in-progress turn so the "last turn" reflects streaming
			// edits live; once it completes it moves into `turns` under the same
			// id, so the tracked changeset transitions seamlessly.
			return chatState.activeTurn?.id ?? chatState.turns?.at(-1)?.id;
		});

		// Last turn changes
		this.channelUriObs = derivedOpts({ equalsFn: isEqual }, reader => {
			const lastTurnId = lastTurnIdObs.read(reader);
			if (!lastTurnId) {
				return undefined;
			}

			const uri = changesetSummary.uriTemplate.replace('{turnId}', lastTurnId);
			return uri ? URI.parse(uri) : undefined;
		});

		// Subscribe to last turn changes
		this.changesetStateObs = createActiveSessionSubscriptionObs<ChangesetState>(
			options,
			isActiveSessionObs,
			StateComponents.Changeset,
			this.channelUriObs,
		);

		this.isEnabled = derived(reader => this.channelUriObs.read(reader) !== undefined);
	}
}
