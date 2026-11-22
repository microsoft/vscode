/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { autorun, derived, derivedOpts, observableSignal, observableSignalFromEvent, ObservablePromise, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { isEqual, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { gitHubPullRequestArtifactIntegrationId, gitHubPullRequestArtifactWorkspaceSettingsKey, gitHubPullRequestMarkReadyIgnoredChecksSetting } from '../../../../../../platform/agentHost/common/githubPullRequestArtifact.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ConfigurationModelParser } from '../../../../../../platform/configuration/common/configurationModels.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { FOLDER_SETTINGS_PATH } from '../../../../../services/configuration/common/configuration.js';
import { ArtifactWorkspaceConfigurationSynchronizer } from './agentHostArtifactIntegrations.js';

type WorkspaceSettings = { readonly chat: string; readonly workingDirectory: string; readonly ignoredChecks: unknown } | null;

/**
 * How long a changed value must stay unchanged before it is published. The workspace context derives from session
 * state that the host rewrites after every configuration change, so publishing each transient value could feed a loop
 * that floods the session's channel.
 */
export const gitHubPullRequestArtifactWorkspaceSettingsPublishDelay = 250;

/**
 * Mirrors the workspace value of {@link gitHubPullRequestMarkReadyIgnoredChecksSetting} into the session configuration
 * of each GitHub pull request artifact, for the working directory of the chat that recorded it.
 */
export class GitHubPullRequestArtifactWorkspaceConfiguration {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) { }

	readonly synchronize: ArtifactWorkspaceConfigurationSynchronizer = (store, connectionObservable, isHostSelected, session, artifactId, workspace, snapshot) => {
		const configurationService = this.configurationService;
		const settingsChanged = observableSignalFromEvent(store, configurationService.onDidChangeConfiguration);
		let lastValue: WorkspaceSettings | undefined;
		let lastConnection: IAgentConnection | undefined;
		const pending = observableValue<{ readonly connection: IAgentConnection; readonly value: WorkspaceSettings } | undefined>('pendingWorkspaceSettings', undefined);
		const reading = observableValue('readingFolderSettings', false);
		const settingsKey = gitHubPullRequestArtifactWorkspaceSettingsKey(artifactId);
		const resync = observableSignal(store);
		const folder = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => workspace.read(reader)?.resource);
		// A configuration change also covers edits to the folder's settings while this window has the folder open.
		const folderIgnoredChecks = derived(reader => {
			settingsChanged.read(reader);
			const resource = folder.read(reader);
			return resource && new ObservablePromise(this.readFolderIgnoredChecks(resource));
		});
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
				reading.set(false, undefined);
				publish.cancel();
				return;
			}
			if (connection !== lastConnection) {
				lastConnection = connection;
				lastValue = undefined;
			}
			const folderValue = context && folderIgnoredChecks.read(reader)?.promiseResult.read(reader);
			// Both change together, so that a released writer, which is kept while either is set, never sees both cleared in between.
			transaction(tx => {
				reading.set(!!context && !folderValue, tx);
				if (context && !folderValue) {
					// A value derived without the folder's settings could replace the folder's value on the host.
					pending.set(undefined, tx);
					publish.cancel();
					return;
				}
				const ignoredChecks = folderValue && (folderValue.data ?? configurationService.inspect<readonly string[]>(gitHubPullRequestMarkReadyIgnoredChecksSetting).workspaceValue);
				const value: WorkspaceSettings = context && ignoredChecks !== undefined ? { chat: context.chat, workingDirectory: context.workingDirectory, ignoredChecks } : null;
				const current = pending.read(undefined);
				if (structuralEquals(value, lastValue)) {
					pending.set(undefined, tx);
					publish.cancel();
				} else if (current?.connection !== connection || !structuralEquals(value, current.value)) {
					// Each distinct value restarts the delay, so a value that keeps alternating is never published.
					pending.set({ connection, value }, tx);
					publish.schedule();
				}
			});
		}));
		return derived(reader => pending.read(reader) !== undefined || reading.read(reader));
	};

	/**
	 * The setting's value in a folder's own settings file. A window only loads the settings of the folders it has
	 * open: the Agents window opens only the focused chat's folders, and an editor window rarely opens a session's
	 * worktree, while the host keeps automating the artifact in either case.
	 */
	private async readFolderIgnoredChecks(folder: URI): Promise<unknown> {
		const resource = joinPath(folder, FOLDER_SETTINGS_PATH);
		let content: string;
		try {
			content = (await this.fileService.readFile(resource)).value.toString();
		} catch (error) {
			this.logService.trace(`[GitHubPullRequestArtifact] No folder settings at ${resource.toString()}`, error);
			return undefined;
		}
		const parser = new ConfigurationModelParser(resource.toString(), this.logService);
		parser.parse(content);
		return parser.configurationModel.getValue(gitHubPullRequestMarkReadyIgnoredChecksSetting);
	}
}
