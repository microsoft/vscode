/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, derivedOpts, IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChangesetStatus } from '../../../../../platform/agentHost/common/state/protocol/channels-changeset/state.js';
import { ChangesetSummary, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ISessionChangeset, ISessionFileChange, sessionFileChangesEqual } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { changesetFilesToChanges } from './agentHostDiffs.js';
import { IAgentHostAdapterOptions } from './baseAgentHostSessionsProvider.js';

export function createChangesets(
	resource: URI,
	options: IAgentHostAdapterOptions,
	changesets: readonly ChangesetSummary[] | undefined
): IObservable<readonly ISessionChangeset[]> {
	if (!changesets) {
		return constObservable([]);
	}

	// First changeset with a non-template URI is the default, if any;
	// otherwise just the first one. This should be the "Branch Changes"
	// changeset.
	const defaultChangeset = changesets.find(c => !c.uriTemplate.includes('{')) ?? changesets[0];

	return constObservable(changesets.map(changeset => {
		const isDefault = changeset === defaultChangeset;
		return options.instantiationService.createInstance(AgentHostChangeset, resource, options, {
			...changeset, isDefault
		});
	}));
}

export class AgentHostChangeset implements ISessionChangeset {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly isEnabled: IObservable<boolean>;
	readonly isDefault: IObservable<boolean>;
	readonly isLoadingChanges: IObservable<boolean>;
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	readonly originalCheckpointRef: IObservable<string | undefined>;
	readonly modifiedCheckpointRef: IObservable<string | undefined>;

	constructor(
		resource: URI,
		options: IAgentHostAdapterOptions,
		changesetSummary: ChangesetSummary & { isDefault: boolean },
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		this.id = changesetSummary.label;
		this.label = changesetSummary.label;
		this.description = changesetSummary.description;

		this.isEnabled = constObservable(true);
		this.isDefault = constObservable(changesetSummary.isDefault);

		this.originalCheckpointRef = constObservable(undefined);
		this.modifiedCheckpointRef = constObservable(undefined);

		const changesetStateObs = derived(reader => {
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
			if (!activeSession || !isEqual(activeSession.resource, resource)) {
				return constObservable(undefined);
			}

			const connection = options.getConnection();
			if (!connection) {
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

		this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, reader => {
			const changesetState = changesetStateObs.read(reader).read(reader);
			if (!changesetState || changesetState instanceof Error) {
				return [];
			}
			if (changesetState.status !== ChangesetStatus.Ready) {
				return [];
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
	}
}
