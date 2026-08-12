/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedOpts, IObservable, observableSignalFromEvent, ValueWithChangeEventFromObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { getDefaultChangeset } from '../../../../../platform/agentHost/common/changesetUri.js';
import { normalizeFileEdit } from '../../../../../platform/agentHost/common/fileEditDiff.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { createRetainedChangesetFilesObs } from '../../../../../platform/agentHost/common/state/changesetFiles.js';
import { createActiveAgentHostSubscriptionObs } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ChangesetState, SessionState, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { isIChatSessionFileChange2 } from '../../common/chatSessionsService.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { AGENT_SESSION_CHANGES_SCHEME } from './agentSessionsModel.js';
import { IAgentSessionsService } from './agentSessionsService.js';

/** Resolves agent session change lists into reactive multi-diff resources. */
export class AgentSessionChangesMultiDiffSourceResolver extends Disposable implements IWorkbenchContribution, IMultiDiffSourceResolver {

	static readonly ID = 'workbench.contrib.agentSessionChangesMultiDiffSourceResolver';
	private static readonly SUBSCRIPTION_OWNER = 'AgentSessionChangesMultiDiffSourceResolver';
	private readonly connectionChanges: IObservable<void>;

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
	) {
		super();
		this.connectionChanges = observableSignalFromEvent(this, this.agentHostConnectionsService.onDidChangeConnections);
		this._register(multiDiffSourceResolverService.registerResolver(this));
	}

	canHandleUri(uri: URI): boolean {
		return uri.scheme === AGENT_SESSION_CHANGES_SCHEME;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		const sessionResource = URI.parse(decodeURIComponent(uri.query));
		const session = this.agentSessionsService.model.observeSession(sessionResource);
		const agentHostResources = this.createAgentHostResources(sessionResource);
		const resources = derived(this, reader => {
			const changes = session.read(reader)?.changes;
			if (!Array.isArray(changes)) {
				return agentHostResources.read(reader);
			}

			return changes.map(change => {
				const change2 = isIChatSessionFileChange2(change);
				const modifiedUri = change.modifiedUri ?? (change2 && !change.originalUri ? change.uri : undefined);
				const goToFileUri = change2 ? change.modifiedUri ?? change.uri : change.modifiedUri;
				return new MultiDiffEditorItem(change.originalUri, modifiedUri, goToFileUri);
			});
		});
		return { resources: new ValueWithChangeEventFromObservable(resources) };
	}

	private createAgentHostResources(sessionResource: URI): IObservable<readonly MultiDiffEditorItem[]> {
		const resolution = derived(this, reader => {
			this.connectionChanges.read(reader);
			return this.agentHostConnectionsService.resolveSessionResource(sessionResource);
		});
		const connection = derivedOpts<IAgentConnection | undefined>({ owner: this, equalsFn: () => false }, reader => {
			return resolution.read(reader)?.connection;
		});
		const sessionStateObs = createActiveAgentHostSubscriptionObs<SessionState>(
			this,
			connection,
			constObservable(true),
			StateComponents.Session,
			resolution.map(resolution => resolution?.backendSession),
			AgentSessionChangesMultiDiffSourceResolver.SUBSCRIPTION_OWNER,
		);
		const changeset = derived(this, reader => {
			const state = sessionStateObs.read(reader).read(reader);
			return state && !(state instanceof Error) ? getDefaultChangeset(state.changesets) : undefined;
		});
		const changesetResource = derivedOpts<URI | undefined>({ owner: this, equalsFn: isEqual }, reader => {
			const summary = changeset.read(reader);
			return summary && !summary.uriTemplate.includes('{') ? URI.parse(summary.uriTemplate) : undefined;
		});
		const changesetStateObs = createActiveAgentHostSubscriptionObs<ChangesetState>(
			this,
			connection,
			constObservable(true),
			StateComponents.Changeset,
			changesetResource,
			AgentSessionChangesMultiDiffSourceResolver.SUBSCRIPTION_OWNER,
		);
		const changesetFiles = createRetainedChangesetFilesObs(this, changesetStateObs);

		return derived(this, reader => {
			const resolved = resolution.read(reader);
			const connection = resolved && this.agentHostConnectionsService.connections.find(connection => connection.connection === resolved.connection);
			const mapUri = connection
				? (resource: URI) => toAgentHostUri(resource, connection.authority)
				: (resource: URI) => resource;
			const resources: MultiDiffEditorItem[] = [];
			for (const file of changesetFiles.read(reader) ?? []) {
				const edit = normalizeFileEdit(file.edit);
				if (!edit) {
					continue;
				}
				resources.push(new MultiDiffEditorItem(
					edit.beforeContentUri ? mapUri(edit.beforeContentUri) : undefined,
					edit.afterUri ? mapUri(edit.afterUri) : undefined,
					mapUri(edit.resource),
				));
			}
			return resources;
		});
	}
}
