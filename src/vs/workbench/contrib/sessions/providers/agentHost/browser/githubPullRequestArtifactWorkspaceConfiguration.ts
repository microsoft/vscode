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
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
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

/** How long to wait before reading a folder's settings again after they could not be read. */
export const gitHubPullRequestArtifactFolderSettingsRetryDelay = 10_000;

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
		const retry = observableSignal(store);
		const retryRead = store.add(new RunOnceScheduler(() => retry.trigger(undefined), gitHubPullRequestArtifactFolderSettingsRetryDelay));
		const settingsFile = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			const folder = workspace.read(reader)?.resource;
			return folder && joinPath(folder, FOLDER_SETTINGS_PATH);
		});
		// Configuration change events only cover edits to the folder's settings while this window has the folder open.
		const settingsFileChanged = derived(reader => {
			const resource = settingsFile.read(reader);
			return resource && observableSignalFromEvent(this, reader.store.add(this.fileService.createWatcher(resource, { recursive: false, excludes: [] })).onDidChange);
		});
		const folderIgnoredChecks = derived(reader => {
			settingsChanged.read(reader);
			retry.read(reader);
			settingsFileChanged.read(reader)?.read(reader);
			const resource = settingsFile.read(reader);
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
		const integrated = derived(reader => snapshot.read(reader)?.contributions.some(contribution => contribution.integrationId === gitHubPullRequestArtifactIntegrationId) ?? false);
		// Every listener receives every session's actions, so only pull request artifacts listen, and they resubscribe only
		// when the event changes: the provider sets the same connection again on every session change, while a connection
		// that is still connecting can replace its event.
		const onDidAction = derived(reader => integrated.read(reader) ? connectionObservable.read(reader)?.onDidAction : undefined);
		store.add(autorun(reader => {
			const event = onDidAction.read(reader);
			if (event) {
				reader.store.add(event(envelope => {
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
			const isIntegrated = integrated.read(reader);
			if (!isHostSelected() || connection?.connectionAvailable?.read(reader) !== true || !isIntegrated) {
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
			const read = context && folderIgnoredChecks.read(reader)?.promiseResult.read(reader);
			const folderSettings = read?.data;
			// Both change together, so that a released writer, which is kept while either is set, never sees both cleared in between.
			transaction(tx => {
				reading.set(!!context && !read, tx);
				if (context && !folderSettings) {
					// A value derived without the folder's settings could replace the folder's value on the host, so
					// nothing is published until they are read, including again after a failed read.
					pending.set(undefined, tx);
					publish.cancel();
					if (read && !retryRead.isScheduled()) {
						retryRead.schedule();
					}
					return;
				}
				retryRead.cancel();
				const ignoredChecks = folderSettings && (folderSettings.ignoredChecks ?? configurationService.inspect<readonly string[]>(gitHubPullRequestMarkReadyIgnoredChecksSetting).workspaceValue);
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
	 * The setting's value in a folder's settings file, or `undefined` when the file exists but could not be read. A
	 * window only loads the settings of the folders it has open: the Agents window opens only the focused chat's
	 * folders, and an editor window rarely opens a session's worktree, while the host keeps automating the artifact in
	 * either case.
	 */
	private async readFolderIgnoredChecks(resource: URI): Promise<{ readonly ignoredChecks: unknown } | undefined> {
		// A window that cannot access the folder at all has no folder value, as when it has not opened the folder.
		if (!await this.fileService.canHandleResource(resource)) {
			return { ignoredChecks: undefined };
		}
		let content: string;
		try {
			content = (await this.fileService.readFile(resource)).value.toString();
		} catch (error) {
			const result = toFileOperationResult(error);
			if (result === FileOperationResult.FILE_NOT_FOUND || result === FileOperationResult.FILE_NOT_DIRECTORY) {
				return { ignoredChecks: undefined };
			}
			this.logService.warn(`[GitHubPullRequestArtifact] Could not read ${resource.toString()}`, error);
			return undefined;
		}
		const parser = new ConfigurationModelParser(resource.toString(), this.logService);
		parser.parse(content);
		return { ignoredChecks: parser.configurationModel.getValue(gitHubPullRequestMarkReadyIgnoredChecksSetting) };
	}
}
