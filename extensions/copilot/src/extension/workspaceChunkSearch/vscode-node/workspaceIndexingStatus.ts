/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { t } from '@vscode/l10n';
import * as vscode from 'vscode';
import { ResolvedRepoRemoteInfo } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { ICodeSearchAuthenticationService } from '../../../platform/remoteCodeSearch/node/codeSearchRepoAuth';
import { CodeSearchRepoStatus } from '../../../platform/workspaceChunkSearch/node/codeSearch/codeSearchRepo';
import { IWorkspaceChunkSearchService, WorkspaceIndexState } from '../../../platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { commandUri } from '../../linkify/common/commands';
import { buildRemoteIndexCommandId } from './commands';


const reauthenticateCommandId = '_copilot.workspaceIndex.signInAgain';

const codebaseSemanticSearchDocsLink = 'https://aka.ms/vscode-copilot-workspace-remote-index';

interface WorkspaceIndexStateReporter {
	readonly onDidChangeIndexState: Event<void>;

	getIndexState(): Promise<WorkspaceIndexState>;
}

export class MockWorkspaceIndexStateReporter extends Disposable implements WorkspaceIndexStateReporter {
	private _indexState: WorkspaceIndexState;

	private readonly _onDidChangeIndexState = this._register(new Emitter<void>());
	public readonly onDidChangeIndexState = this._onDidChangeIndexState.event;

	constructor(initialState: WorkspaceIndexState) {
		super();

		this._indexState = initialState;
	}

	async getIndexState(): Promise<WorkspaceIndexState> {
		return this._indexState;
	}

	updateIndexState(newState: WorkspaceIndexState): void {
		this._indexState = newState;
		this._onDidChangeIndexState.fire();
	}
}

interface ChatStatusItemState {
	readonly primary: {
		readonly message: string;
		readonly icon?: string;
		readonly busy?: boolean;
	};
	readonly details?: {
		readonly message: string;
		readonly busy: boolean;
	};
}

const spinnerCodicon = '$(loading~spin)';
const statusTitle = t`Codebase Semantic Index`;

export class ChatStatusWorkspaceIndexingStatus extends Disposable {

	private readonly _statusItem: vscode.ChatStatusItem;

	private readonly _statusReporter: WorkspaceIndexStateReporter;

	constructor(
		@IWorkspaceChunkSearchService workspaceChunkSearch: IWorkspaceChunkSearchService,
		@ICodeSearchAuthenticationService private readonly _codeSearchAuthService: ICodeSearchAuthenticationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._statusReporter = workspaceChunkSearch;

		this._statusItem = this._register(vscode.window.createChatStatusItem('copilot.workspaceIndexStatus'));
		this._statusItem.title = statusTitle;

		this._register(this._statusReporter.onDidChangeIndexState(() => this._updateStatusItem()));

		this._register(this.registerCommands());

		// Write an initial status
		this._writeStatusItem({
			primary: {
				message: t`Checking index status`,
				busy: true
			},
			details: undefined
		});

		// And kick off async update to get the real status
		this._updateStatusItem();
	}

	private currentUpdateRequestId = 0;

	private async _updateStatusItem(): Promise<void> {
		const id = ++this.currentUpdateRequestId;
		this._logService.trace(`ChatStatusWorkspaceIndexingStatus::updateStatusItem(id=${id}): starting`);

		const state = await this._statusReporter.getIndexState();

		// Make sure a new request hasn't come in since we started
		if (id !== this.currentUpdateRequestId) {
			this._logService.trace(`ChatStatusWorkspaceIndexingStatus::updateStatusItem(id=${id}): skipping`);
			return;
		}

		// If we have remote index info, prioritize showing information related to it
		switch (state.remoteIndexState.status) {
			case 'initializing':
				return this._writeStatusItem({
					primary: {
						message: t('Checking index status'),
						busy: true,
					},
				});

			case 'loaded': {
				// See if any repos are still being checked/resolved
				if (state.remoteIndexState.repos.some(repo => repo.status === CodeSearchRepoStatus.CheckingStatus || repo.status === CodeSearchRepoStatus.Resolving)) {
					return this._writeStatusItem({
						primary: {
							message: t('Checking repo statuses'),
							busy: true,
						},
					});
				}

				// See if we are still building any indexes
				if (state.remoteIndexState.repos.some(repo => repo.status === CodeSearchRepoStatus.BuildingIndex)
					|| state.remoteIndexState.externalIngestState?.status === CodeSearchRepoStatus.BuildingIndex
				) {
					return this._writeStatusItem({
						primary: {
							message: t('Building Index'),
							busy: true,
						},
					});
				}

				// Check if we have any errors
				const readyRepos = state.remoteIndexState.repos.filter(repo => repo.status === CodeSearchRepoStatus.Ready);
				const errorRepos = state.remoteIndexState.repos.filter(repo => repo.status === CodeSearchRepoStatus.CouldNotCheckIndexStatus || repo.status === CodeSearchRepoStatus.NotAuthorized);
				if (errorRepos.length > 0) {
					const inaccessibleRepo = errorRepos[0].remoteInfo;
					if (readyRepos.length) {
						return this._writeStatusItem({
							primary: {
								message: readyRepos.length === 1
									? t('1 repo with index')
									: t('{0} repos with indexes', readyRepos.length),
								icon: '$(warning)',
							},
							details: {
								message: errorRepos.length === 1
									? t(`[Try re-authenticating for 1 additional repo](${commandUri(reauthenticateCommandId, [inaccessibleRepo])} "${t('Try signing in again to use the codebase index')}")`)
									: t(`[Try re-authenticating for {0} additional repos](${commandUri(reauthenticateCommandId, [inaccessibleRepo])} "${t('Try signing in again to use the codebase index')}")`, errorRepos.length),
								busy: false,
							},
						});
					} else {
						return this._writeStatusItem({
							primary: {
								message: t('Index unavailable'),
								icon: '$(error)',
							},
							details: {
								message: t(`[Try re-authenticating](${commandUri(reauthenticateCommandId, [inaccessibleRepo])} "${t('Try signing in again to use the codebase index')}")`),
								busy: false,
							},
						});
					}
				}

				// See if we have any unindexed repos
				if (state.remoteIndexState.repos.some(repo => repo.status === CodeSearchRepoStatus.NotYetIndexed)) {
					return this._writeStatusItem({
						primary: {
							message: state.remoteIndexState.repos.every(repo => repo.status === CodeSearchRepoStatus.NotYetIndexed)
								? t('Index not yet built')
								: t('Index not yet built for a repo in the workspace'),
							icon: '$(warning)',
						},
						details: {
							message: `[${t`Build index`}](command:${buildRemoteIndexCommandId} "${t('Build Codebase Index')}")`,
							busy: false,
						}
					});
				}

				// See if we're fully indexed
				if (
					// Either with external ingest
					state.remoteIndexState.externalIngestState?.status === CodeSearchRepoStatus.Ready
					// Or if external ingest is disabled but all repos are indexed.
					// This isn't 100% true because files outside of the repos aren't indexed in this case
					|| (
						!state.remoteIndexState.externalIngestState
						&& state.remoteIndexState.repos.length > 0
						&& state.remoteIndexState.repos.every(repo => repo.status === CodeSearchRepoStatus.Ready)
					)
				) {
					return this._writeStatusItem({
						primary: {
							message: t('Index ready'),
							icon: '$(check)',
						},
					});
				}

				// External indexing is enabled but not yet fully built
				if (typeof state.remoteIndexState.externalIngestState !== 'undefined') {
					return this._writeStatusItem({
						primary: {
							message: t('Out of date'),
							icon: '$(warning)',
						},
						details: {
							message: `[${t`Update index`}](command:${buildRemoteIndexCommandId} "${t('Update Codebase Index')}")`,
							busy: false,
						}
					});
				}

				break;
			}
			case 'disabled': {
				// fallthrough
				break;
			}
		}

		this._writeStatusItem({
			primary: {
				message: t('Codebase index not available'),
				icon: '$(circle-slash)',
			},
			details: undefined
		});
	}

	private _writeStatusItem(values: ChatStatusItemState | undefined) {
		this._logService.trace(`ChatStatusWorkspaceIndexingStatus::_writeStatusItem()`);

		if (!values) {
			this._statusItem.hide();
			return;
		}

		this._statusItem.show();

		this._statusItem.title = {
			label: statusTitle,
			link: codebaseSemanticSearchDocsLink,
			helpText: t`Indexes your codebase for more relevant AI results.`,
		};

		this._statusItem.description = coalesce([
			values.primary.icon,
			values.primary.message,
			values.primary.busy ? spinnerCodicon : undefined,
		]).join(' ');

		if (values.details) {
			this._statusItem.detail = coalesce([
				values.details.message,
				values.details.busy ? spinnerCodicon : undefined
			]).join(' ');
		} else {
			this._statusItem.detail = '';
		}
	}

	private registerCommands(): IDisposable {
		const disposables = new DisposableStore();

		disposables.add(vscode.commands.registerCommand(reauthenticateCommandId, async (repo: ResolvedRepoRemoteInfo | undefined) => {
			if (!repo) {
				return;
			}

			return this._codeSearchAuthService.tryReauthenticating(repo);
		}));

		return disposables;
	}
}

