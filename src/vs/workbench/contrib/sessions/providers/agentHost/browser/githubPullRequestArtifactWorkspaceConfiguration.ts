/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { autorun, derived, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { gitHubPullRequestArtifactIntegrationId, gitHubPullRequestArtifactWorkspaceSettingsKey, gitHubPullRequestMarkReadyIgnoredChecksSetting } from '../../../../../../platform/agentHost/common/githubPullRequestArtifact.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ArtifactWorkspaceConfigurationSynchronizer } from './agentHostArtifactIntegrations.js';

type WorkspaceSettings = { readonly chat: string; readonly workingDirectory: string; readonly ignoredChecks: unknown } | null;

/**
 * How long a changed value must stay unchanged before it is published. The workspace context derives from session
 * state that the host rewrites after every configuration change, so publishing each transient value could feed a loop
 * that floods the session's channel.
 */
export const gitHubPullRequestArtifactWorkspaceSettingsPublishDelay = 250;

export function createGitHubPullRequestArtifactWorkspaceConfigurationSynchronizer(configurationService: IConfigurationService): ArtifactWorkspaceConfigurationSynchronizer {
	return (store, connectionObservable, isHostSelected, session, artifactId, workspace, snapshot) => {
		const settingsChanged = observableSignalFromEvent(store, configurationService.onDidChangeConfiguration);
		let lastValue: WorkspaceSettings | undefined;
		let lastConnection: IAgentConnection | undefined;
		const pending = observableValue<{ readonly connection: IAgentConnection; readonly value: WorkspaceSettings } | undefined>('pendingWorkspaceSettings', undefined);
		const settingsKey = gitHubPullRequestArtifactWorkspaceSettingsKey(artifactId);
		const resync = observableSignal(store);
		const publish = store.add(new RunOnceScheduler(() => {
			const next = pending.get();
			pending.set(undefined, undefined);
			if (next && isHostSelected()) {
				lastValue = next.value;
				next.connection.dispatch(session, {
					type: ActionType.SessionConfigChanged,
					config: { [settingsKey]: next.value },
				});
			}
		}, gitHubPullRequestArtifactWorkspaceSettingsPublishDelay));
		store.add(autorun(reader => {
			const connection = connectionObservable.read(reader);
			if (connection) {
				reader.store.add(connection.onDidAction(envelope => {
					if (!envelope.rejectionReason && envelope.channel === session && envelope.action.type === ActionType.SessionConfigChanged
						&& envelope.action.replace && !Object.hasOwn(envelope.action.config, settingsKey)) {
						lastValue = undefined;
						resync.trigger(undefined);
					}
				}));
			}
		}));
		store.add(autorun(reader => {
			settingsChanged.read(reader);
			resync.read(reader);
			const connection = connectionObservable.read(reader);
			const context = workspace.read(reader);
			const integrated = snapshot.read(reader)?.contributions.some(contribution => contribution.integrationId === gitHubPullRequestArtifactIntegrationId) ?? false;
			if (!isHostSelected() || connection?.connectionAvailable?.read(reader) !== true || !integrated) {
				lastValue = undefined;
				pending.set(undefined, undefined);
				publish.cancel();
				return;
			}
			if (connection !== lastConnection) {
				lastConnection = connection;
				lastValue = undefined;
			}
			const inspected = context ? configurationService.inspect<readonly string[]>(gitHubPullRequestMarkReadyIgnoredChecksSetting, { resource: context.resource }) : undefined;
			const ignoredChecks = inspected?.workspaceFolderValue ?? inspected?.workspaceValue;
			const value: WorkspaceSettings = context && ignoredChecks !== undefined ? { chat: context.chat, workingDirectory: context.workingDirectory, ignoredChecks } : null;
			const current = pending.read(undefined);
			if (structuralEquals(value, lastValue)) {
				pending.set(undefined, undefined);
				publish.cancel();
			} else if (current?.connection !== connection || !structuralEquals(value, current.value)) {
				// Each distinct value restarts the delay, so a value that keeps alternating is never published.
				pending.set({ connection, value }, undefined);
				publish.schedule();
			}
		}));
		return derived(reader => pending.read(reader) !== undefined);
	};
}
