/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, derivedObservableWithCache, derivedOpts, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ChangesetStatus, Changeset, StateComponents, type ChangesetState, type Turn } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ISessionChangeset, ISessionFileChange, sessionFileChangesEqual } from '../../../../services/sessions/common/session.js';
import { changesetFilesToChanges } from './agentHostDiffs.js';
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

function createActiveSessionSubscriptionObs<T>(
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
	protected abstract readonly changesetStateObs: IObservable<IObservable<ChangesetState | Error | undefined | null>>;

	constructor(options: IAgentHostAdapterOptions) {
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

			return changesetState.status === ChangesetStatus.Computing;
		});

		const changesObs = derivedObservableWithCache<readonly ISessionFileChange[] | undefined>(this, (reader, lastValue) => {
			const changesetState = this.changesetStateObs.read(reader).read(reader);
			if (changesetState === null || changesetState instanceof Error) {
				return [];
			}

			if (changesetState === undefined || changesetState.status !== ChangesetStatus.Ready) {
				return lastValue;
			}

			const files = changesetFilesToChanges(changesetState.files);
			return options.mapDiffUri
				? files.map(f => ({
					...f,
					uri: options.mapDiffUri!(f.uri),
					originalUri: f.originalUri ? options.mapDiffUri!(f.originalUri) : undefined,
					modifiedUri: f.modifiedUri ? options.mapDiffUri!(f.modifiedUri) : undefined,
				}))
				: files;
		});

		this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, reader => {
			return changesObs.read(reader) ?? [];
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

	protected override readonly changesetStateObs: IObservable<IObservable<ChangesetState | Error | undefined | null>>;

	constructor(
		options: IAgentHostAdapterOptions,
		isActiveSessionObs: IObservable<boolean>,
		changesetSummary: Changeset & { isDefault: boolean },
	) {
		super(options);

		this.changesetStateObs = createActiveSessionSubscriptionObs<ChangesetState>(
			options,
			isActiveSessionObs,
			StateComponents.Changeset,
			constObservable(URI.parse(changesetSummary.uriTemplate)),
		);

		this.id = changesetSummary.changeKind;
		this._label = changesetSummary.label;
		this._description = changesetSummary.description;

		this.isDefault = constObservable(changesetSummary.isDefault);
	}

	update(changesetSummary: Changeset): void {
		this._label = changesetSummary.label;
		this._description = changesetSummary.description;
	}
}

class AgentHostLastTurnChangeset extends AbstractAgentHostChangeset {
	readonly id: string;
	readonly label = localize('lastTurnChanges', "Last Turn Changes");
	readonly description = localize('lastTurnChangesDescription', "Show only changes made in the last turn");

	readonly isDefault = observableValue(this, false);
	readonly isEnabled: IObservable<boolean>;
	protected readonly changesetStateObs: IObservable<IObservable<ChangesetState | Error | undefined | null>>;

	constructor(
		sessionUri: URI,
		options: IAgentHostAdapterOptions,
		isActiveSessionObs: IObservable<boolean>,
		changesetSummary: Changeset & { isDefault: boolean },
	) {
		super(options);

		this.id = changesetSummary.changeKind;

		// Subscribe to session changes
		const sessionStateObs = createActiveSessionSubscriptionObs<{ turns: readonly Turn[] }>(
			options,
			isActiveSessionObs,
			StateComponents.Session,
			constObservable(sessionUri),
		);

		const turnIdsObs = derived(reader => {
			const sessionState = sessionStateObs.read(reader).read(reader);
			if (!sessionState || sessionState instanceof Error) {
				return undefined;
			}
			return sessionState.turns.map(turn => turn.id);
		});

		// Last turn changes
		const changesetUriObs = derivedOpts({ equalsFn: isEqual }, reader => {
			const lastTurnId = turnIdsObs.read(reader)?.at(-1);
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
			changesetUriObs,
		);

		this.isEnabled = derived(reader => changesetUriObs.read(reader) !== undefined);
	}
}
