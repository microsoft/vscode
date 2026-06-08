/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, derivedObservableWithCache, derivedOpts, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { buildCompareTurnsChangesetUri, buildTurnChangesetUri, BASELINE_TURN_ID } from '../../../../../platform/agentHost/common/changesetUri.js';
import { ChangesetStatus, ChangesetSummary, StateComponents, type ChangesetState, type Turn } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ISessionChangeset, ISessionFileChange, sessionFileChangesEqual } from '../../../../services/sessions/common/session.js';
import { changesetFilesToChanges } from './agentHostDiffs.js';
import { IAgentHostAdapterOptions } from './baseAgentHostSessionsProvider.js';

export function createChangesets(
	sessionUri: URI,
	options: IAgentHostAdapterOptions,
	isActiveSessionObs: IObservable<boolean>,
	changesets: readonly ChangesetSummary[] | undefined
): readonly ISessionChangeset[] {
	if (!changesets) {
		return [];
	}

	// First changeset with a non-template URI is the default, if any;
	// otherwise just the first one. This should be the "Branch Changes"
	// changeset.
	const defaultChangeset = changesets.find(c => !c.uriTemplate.includes('{')) ?? changesets[0];
	const builtChangesets: ISessionChangeset[] = changesets.map(changeset => {
		const isDefault = changeset === defaultChangeset;
		return options.instantiationService.createInstance(AgentHostCatalogChangeset, options, isActiveSessionObs, {
			...changeset, isDefault
		});
	});

	builtChangesets.push(
		options.instantiationService.createInstance(AgentHostAllChangesChangeset, sessionUri, options, isActiveSessionObs),
		options.instantiationService.createInstance(AgentHostLastTurnChangesChangeset, sessionUri, options, isActiveSessionObs),
	);

	return builtChangesets;
}

function createActiveSessionSubscriptionObs<TValue>(
	options: IAgentHostAdapterOptions,
	isActiveSessionObs: IObservable<boolean>,
	component: StateComponents,
	resourceObs: IObservable<URI | undefined>,
): IObservable<IObservable<TValue | Error | undefined>> {
	return derived(reader => {
		const connection = options.getConnection();
		if (!connection) {
			return constObservable(undefined);
		}

		const resource = resourceObs.read(reader);
		if (!resource) {
			return constObservable(undefined);
		}

		const isActiveSession = isActiveSessionObs.read(reader);
		if (!isActiveSession) {
			return constObservable(undefined);
		}

		const subscriptionRef = connection.getSubscription(component, resource, 'AgentHostSessionChangesets');
		reader.store.add(subscriptionRef);

		return observableFromEvent(subscriptionRef.object.onDidChange,
			() => subscriptionRef.object.value as TValue | Error | undefined);
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
	protected abstract readonly changesetStateObs: IObservable<IObservable<ChangesetState | Error | undefined>>;

	constructor(options: IAgentHostAdapterOptions) {
		this.isLoadingChanges = derived(reader => {
			const changesetState = this.changesetStateObs.read(reader).read(reader);
			if (!changesetState || changesetState instanceof Error) {
				return false;
			}
			return changesetState.status === ChangesetStatus.Computing;
		});

		const changesObs = derivedObservableWithCache<readonly ISessionFileChange[] | undefined>(this, (reader, lastValue) => {
			const changesetState = this.changesetStateObs.read(reader).read(reader);
			if (!changesetState || changesetState instanceof Error) {
				return [];
			}
			if (changesetState.status !== ChangesetStatus.Ready) {
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

export class AgentHostCatalogChangeset extends AbstractAgentHostChangeset {
	readonly id: string;

	private _label: string;
	get label(): string { return this._label; }

	private _description?: string;
	get description(): string | undefined { return this._description; }

	readonly isEnabled = constObservable(true);
	readonly isDefault: IObservable<boolean>;

	protected override readonly changesetStateObs: IObservable<IObservable<ChangesetState | Error | undefined>>;

	constructor(
		options: IAgentHostAdapterOptions,
		isActiveSessionObs: IObservable<boolean>,
		changesetSummary: ChangesetSummary & { isDefault: boolean },
	) {
		super(options);

		this.changesetStateObs = createActiveSessionSubscriptionObs<ChangesetState>(
			options,
			isActiveSessionObs,
			StateComponents.Changeset,
			constObservable(URI.parse(changesetSummary.uriTemplate)),
		);

		this.id = changesetSummary.label;
		this._label = changesetSummary.label;
		this._description = changesetSummary.description;

		this.isDefault = constObservable(changesetSummary.isDefault);
	}

	update(changesetSummary: ChangesetSummary): void {
		this._label = changesetSummary.label;
		this._description = changesetSummary.description;
	}
}

abstract class AbstractAgentHostTurnCompareChangeset extends AbstractAgentHostChangeset {
	readonly category = 'turn-compare-changesets';

	override readonly isEnabled: IObservable<boolean>;
	override readonly isDefault = constObservable(false);

	protected readonly changesetStateObs: IObservable<IObservable<ChangesetState | Error | undefined>>;

	constructor(
		sessionUri: URI,
		options: IAgentHostAdapterOptions,
		isActiveSessionObs: IObservable<boolean>,
		resolveChangesetUri: (turnIdsObs: IObservable<readonly string[] | undefined>) => IObservable<URI | undefined>,
	) {
		super(options);

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

		const changesetUriObs = resolveChangesetUri(turnIdsObs);

		this.changesetStateObs = createActiveSessionSubscriptionObs<ChangesetState>(
			options,
			isActiveSessionObs,
			StateComponents.Changeset,
			changesetUriObs,
		);

		this.isEnabled = derived(reader => changesetUriObs.read(reader) !== undefined);
	}
}

class AgentHostAllChangesChangeset extends AbstractAgentHostTurnCompareChangeset {
	readonly id = 'All Changes';
	readonly label = localize('allChanges', "All Changes");
	readonly description = localize('allChangesDescription', "Show all changes made in this session");

	constructor(
		sessionUri: URI,
		options: IAgentHostAdapterOptions,
		isActiveSessionObs: IObservable<boolean>,
	) {
		super(sessionUri, options, isActiveSessionObs, turnIdsObs =>
			derivedOpts({ equalsFn: isEqual }, reader => {
				const modifiedTurnId = turnIdsObs.read(reader)?.at(-1);
				if (!modifiedTurnId) {
					return undefined;
				}

				const uri = buildCompareTurnsChangesetUri(sessionUri.toString(), BASELINE_TURN_ID, modifiedTurnId);
				return uri ? URI.parse(uri) : undefined;
			}));
	}
}

class AgentHostLastTurnChangesChangeset extends AbstractAgentHostTurnCompareChangeset {
	readonly id = 'Last Turn Changes';
	readonly label = localize('lastTurnChanges', "Last Turn Changes");
	readonly description = localize('lastTurnChangesDescription', "Show only changes made in the last turn");

	constructor(
		sessionUri: URI,
		options: IAgentHostAdapterOptions,
		isActiveSessionObs: IObservable<boolean>,
	) {
		super(sessionUri, options, isActiveSessionObs, turnIdsObs =>
			derivedOpts({ equalsFn: isEqual }, reader => {
				const lastTurnId = turnIdsObs.read(reader)?.at(-1);
				if (!lastTurnId) {
					return undefined;
				}
				const uri = buildTurnChangesetUri(sessionUri.toString(), lastTurnId);
				return uri ? URI.parse(uri) : undefined;
			}));
	}
}
