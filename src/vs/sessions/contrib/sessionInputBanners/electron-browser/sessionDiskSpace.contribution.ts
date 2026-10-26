/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, ISessionWorktreeCleanupService, LOW_DISK_SPACE_BYTES } from '../browser/sessionWorktreeCleanupService.js';

const DISK_SPACE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export class SessionDiskSpaceContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.diskSpace';

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ISessionWorktreeCleanupService private readonly cleanupService: ISessionWorktreeCleanupService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const scheduler = this._register(new RunOnceScheduler(() => {
			void this.checkDiskSpace().catch(error => this.logService.warn('[SessionDiskSpace] Failed to check disk space', error)).finally(() => {
				if (!this._store.isDisposed) {
					scheduler.schedule(DISK_SPACE_CHECK_INTERVAL_MS);
				}
			});
		}, 10_000));
		this._register(this.sessionsManagementService.onDidChangeSessions(() => {
			scheduler.schedule();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING)) {
				scheduler.schedule();
			}
		}));
		scheduler.schedule();
	}

	private isEnabled(): boolean {
		return !this.chatEntitlementService.sentiment.hidden
			&& this.configurationService.getValue<boolean>(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING) === true;
	}

	private async checkDiskSpace(): Promise<void> {
		if (!this.isEnabled()) {
			this.cleanupService.setAvailableDiskSpace(undefined);
			return;
		}
		const paths = new Set(this.sessionsManagementService.getSessions().flatMap(session =>
			session.workspace.get()?.folders.flatMap(folder => {
				const uri = folder.gitRepository?.workTreeUri;
				return uri?.scheme === Schemas.file ? [uri.fsPath] : [];
			}) ?? []
		));
		for (const path of paths) {
			let availableBytes: number;
			try {
				availableBytes = await this.nativeHostService.getFreeDiskSpace(path);
			} catch (error) {
				this.logService.warn('[SessionDiskSpace] Failed to check worktree disk space', error);
				continue;
			}
			if (this._store.isDisposed || !this.isEnabled()) {
				return;
			}
			if (availableBytes >= LOW_DISK_SPACE_BYTES) {
				continue;
			}
			this.cleanupService.setAvailableDiskSpace(availableBytes);
			return;
		}
		this.cleanupService.setAvailableDiskSpace(undefined);
	}
}

registerWorkbenchContribution2(SessionDiskSpaceContribution.ID, SessionDiskSpaceContribution, WorkbenchPhase.AfterRestored);
