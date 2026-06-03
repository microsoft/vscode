/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, derivedObservableWithCache, derivedOpts, IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChangesetStatus, ChangesetSummary, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ISessionChangeset, ISessionFileChange, sessionFileChangesEqual } from '../../../../services/sessions/common/session.js';
import { changesetFilesToChanges } from './agentHostDiffs.js';
import { IAgentHostAdapterOptions } from './baseAgentHostSessionsProvider.js';

export function createChangesets(
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

	return changesets.map(changeset => {
		const isDefault = changeset === defaultChangeset;
		return options.instantiationService.createInstance(AgentHostChangeset, options, isActiveSessionObs, {
			...changeset, isDefault
		});
	});
}

export class AgentHostChangeset implements ISessionChangeset {
	readonly id: string;

	private _label: string;
	get label(): string { return this._label; }

	private _description?: string;
	get description(): string | undefined { return this._description; }

	readonly isEnabled: IObservable<boolean>;
	readonly isDefault: IObservable<boolean>;
	readonly isLoadingChanges: IObservable<boolean>;
	readonly changes: IObservable<readonly ISessionFileChange[]>;

	readonly originalCheckpointRef: IObservable<string | undefined>;
	readonly modifiedCheckpointRef: IObservable<string | undefined>;

	constructor(
		options: IAgentHostAdapterOptions,
		isActiveSessionObs: IObservable<boolean>,
		changesetSummary: ChangesetSummary & { isDefault: boolean },
	) {
		this.id = changesetSummary.label;
		this._label = changesetSummary.label;
		this._description = changesetSummary.description;

		this.isEnabled = constObservable(true);
		this.isDefault = constObservable(changesetSummary.isDefault);

		this.originalCheckpointRef = constObservable(undefined);
		this.modifiedCheckpointRef = constObservable(undefined);

		const changesetStateObs = derived(reader => {
			const connection = options.getConnection();
			if (!connection) {
				return constObservable(undefined);
			}

			const isActiveSession = isActiveSessionObs.read(reader);
			if (!isActiveSession) {
				return constObservable(undefined);
			}

			const subscriptionRef = connection.getSubscription(StateComponents.Changeset, URI.parse(changesetSummary.uriTemplate));
			reader.store.add(subscriptionRef);

			return observableFromEvent(subscriptionRef.object.onDidChange, () => subscriptionRef.object.value);
		});

		this.isLoadingChanges = derived(reader => {
			const changesetState = changesetStateObs.read(reader).read(reader);
			if (!changesetState || changesetState instanceof Error) {
				return false;
			}
			return changesetState.status === ChangesetStatus.Computing;
		});

		const changesObs = derivedObservableWithCache<readonly ISessionFileChange[] | undefined>(this, (reader, lastValue) => {
			const changesetState = changesetStateObs.read(reader).read(reader);
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

	update(changesetSummary: ChangesetSummary): void {
		this._label = changesetSummary.label;
		this._description = changesetSummary.description;
	}
}
