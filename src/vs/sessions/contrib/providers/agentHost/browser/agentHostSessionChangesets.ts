/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedOpts, IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
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

	return constObservable(changesets.map(
		c => options.instantiationService.createInstance(AgentHostChangeset, resource, options, c)));
}

export class AgentHostChangeset extends Disposable implements ISessionChangeset {
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
		changesetSummary: ChangesetSummary,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this.id = changesetSummary.uriTemplate;
		this.label = changesetSummary.label;
		this.description = changesetSummary.description;

		this.isEnabled = constObservable(true);
		this.isDefault = constObservable(true);
		this.isLoadingChanges = constObservable(false);

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

		this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, reader => {
			const changesetState = changesetStateObs.read(reader).read(reader);
			if (!changesetState || changesetState instanceof Error) {
				return [];
			}
			if (changesetState.status !== 'ready') {
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
