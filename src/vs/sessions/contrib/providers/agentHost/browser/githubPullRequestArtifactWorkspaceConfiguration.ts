/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../../base/common/equals.js';
import { autorun, observableSignal, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { gitHubPullRequestArtifactIntegrationId, gitHubPullRequestArtifactWorkspaceSettingsKey, gitHubPullRequestMarkReadyIgnoredChecksSetting } from '../../../../../platform/agentHost/common/githubPullRequestArtifact.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ArtifactWorkspaceConfigurationSynchronizer } from './agentHostArtifactIntegrations.js';

export function createGitHubPullRequestArtifactWorkspaceConfigurationSynchronizer(configurationService: IConfigurationService): ArtifactWorkspaceConfigurationSynchronizer {
	return (store, connectionObservable, isHostSelected, session, artifactId, workspace, model) => {
		const settingsChanged = observableSignalFromEvent(store, configurationService.onDidChangeConfiguration);
		let lastValue: { readonly chat: string; readonly workingDirectory: string; readonly ignoredChecks: unknown } | null | undefined;
		let lastConnection: IAgentConnection | undefined;
		const settingsKey = gitHubPullRequestArtifactWorkspaceSettingsKey(artifactId);
		const resync = observableSignal(store);
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
			const integrated = model.snapshot.read(reader).contributions.some(contribution => contribution.integrationId === gitHubPullRequestArtifactIntegrationId);
			if (!isHostSelected() || connection?.connectionAvailable?.read(reader) !== true || !integrated) {
				lastValue = undefined;
				return;
			}
			if (connection !== lastConnection) {
				lastConnection = connection;
				lastValue = undefined;
			}
			const inspected = context ? configurationService.inspect<readonly string[]>(gitHubPullRequestMarkReadyIgnoredChecksSetting, { resource: context.resource }) : undefined;
			const ignoredChecks = inspected?.workspaceFolderValue ?? inspected?.workspaceValue;
			const value = context && ignoredChecks !== undefined ? { chat: context.chat, workingDirectory: context.workingDirectory, ignoredChecks } : null;
			if (!structuralEquals(value, lastValue)) {
				lastValue = value;
				connection.dispatch(session, {
					type: ActionType.SessionConfigChanged,
					config: { [settingsKey]: value },
				});
			}
		}));
	};
}
