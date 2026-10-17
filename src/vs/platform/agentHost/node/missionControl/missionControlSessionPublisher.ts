/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentHostGitService, tryResolvePrimaryWorktreeRoot } from '../../common/agentHostGitService.js';
import type { ActionEnvelope } from '../../common/state/sessionActions.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import { type IMissionControlMirrorProject, MissionControlSessionMirror } from './missionControlSessionMirror.js';

const maxPendingFrames = 256;
const maxPendingSessionBytes = 2 * 1024 * 1024;
const maxPendingBytes = 32 * 1024 * 1024;
const maxSessions = 1024;

interface SessionPublication {
	readonly ready: Promise<void>;
	readonly pending: { readonly envelope: ActionEnvelope; readonly bytes: number }[];
	registered: boolean;
	started: boolean;
	failed: boolean;
	bytes: number;
	skipped: number;
}

/** Resolves immutable MC project metadata before admitting either namespace, without blocking local dispatch. */
export class MissionControlSessionPublisher extends Disposable {
	private readonly _sessions = new Map<string, SessionPublication>();
	private _pendingBytes = 0;

	constructor(
		private readonly _mirror: MissionControlSessionMirror,
		private readonly _isEnabled: () => boolean,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _git: IAgentHostGitService,
		@ILogService private readonly _log: ILogService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const publication of this._sessions.values()) {
				publication.pending.length = 0;
			}
			this._sessions.clear();
			this._pendingBytes = 0;
		}));
	}

	registerSession(session: string): Promise<void> {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		let publication = this._sessions.get(session);
		if (!publication) {
			if (this._sessions.size >= maxSessions) {
				throw new Error('Mission Control publisher session capacity exhausted');
			}
			const pending: SessionPublication['pending'] = [];
			publication = {
				ready: this._registerSession(session, pending),
				pending, registered: false, started: false, failed: false, bytes: 0, skipped: 0,
			};
			this._sessions.set(session, publication);
		}
		return publication.ready;
	}

	enqueue(envelope: ActionEnvelope, session: string): void {
		if (!this._isEnabled()) {
			const publication = this._sessions.get(session);
			if (publication && !publication.failed) {
				if (publication.registered) {
					this._mirror.reportSourceLag(session, 1);
				} else {
					publication.skipped++;
				}
			}
			return;
		}
		const ready = this.registerSession(session);
		const publication = this._sessions.get(session)!;
		if (publication.failed) {
			return;
		}
		if (publication.registered) {
			this._publish(envelope, session, publication);
			return;
		}
		if (publication.pending.length === 0) {
			void ready.catch(error => {
				if (!this._store.isDisposed) {
					this._log.error('[AgentHost] Mission Control project resolution failed; session mirroring paused', { session }, error);
				}
			});
		}
		let snapshot: ActionEnvelope;
		let bytes: number;
		try {
			const json = JSON.stringify(envelope);
			if (json === undefined) {
				throw new Error('Unserialisable AHP envelope');
			}
			bytes = Buffer.byteLength(json);
			snapshot = JSON.parse(json);
		} catch (error) {
			publication.skipped++;
			this._log.error('[AgentHost] Mission Control pending action could not be serialized', { session }, error);
			return;
		}
		if (publication.pending.length >= maxPendingFrames || publication.bytes + bytes > maxPendingSessionBytes || this._pendingBytes + bytes > maxPendingBytes) {
			if (++publication.skipped === 1) {
				this._log.error('[AgentHost] Mission Control pending project buffer exhausted', { session });
			}
			return;
		}
		publication.pending.push({ envelope: snapshot, bytes });
		publication.bytes += bytes;
		this._pendingBytes += bytes;
	}

	private async _registerSession(session: string, pending: SessionPublication['pending']): Promise<void> {
		try {
			const project = await this._resolveProject(session);
			if (this._store.isDisposed) {
				throw new CancellationError();
			}
			const publication = this._sessions.get(session)!;
			this._mirror.registerSession(session, project);
			publication.registered = true;
			if (publication.skipped) {
				this._mirror.reportSourceLag(session, publication.skipped);
			}
			for (const item of pending) {
				if (this._isEnabled()) {
					this._publish(item.envelope, session, publication);
				} else {
					this._mirror.reportSourceLag(session, 1);
				}
			}
		} catch (error) {
			const publication = this._sessions.get(session);
			if (publication) {
				publication.failed = true;
			}
			throw error;
		} finally {
			const publication = this._sessions.get(session);
			if (publication) {
				this._pendingBytes -= publication.bytes;
				publication.bytes = 0;
				pending.length = 0;
			}
		}
	}

	private _publish(envelope: ActionEnvelope, session: string, publication: SessionPublication): void {
		if (!publication.started) {
			this._mirror.setLifecycle(session, 'started');
			publication.started = true;
		}
		this._mirror.enqueue(envelope, session);
	}

	private async _resolveProject(session: string): Promise<IMissionControlMirrorProject | undefined> {
		const summary = this._stateManager.getSessionSummary(session);
		const project = summary?.project;
		const projectUri = project && URI.parse(project.uri);
		const directory = summary?.workingDirectories?.[0] ?? (projectUri?.scheme === Schemas.file ? projectUri.toString() : undefined);
		if (!directory) {
			return project && projectFromRemote(project.uri);
		}
		const workingDirectory = URI.parse(directory);
		if (workingDirectory.scheme !== Schemas.file) {
			return undefined;
		}
		const root = await this._git.getRepositoryRoot(workingDirectory);
		if (!root) {
			if (this._git.hasGitRoot(workingDirectory).get() !== false) {
				throw new Error('Mission Control repository root could not be resolved');
			}
			return undefined;
		}
		const remotes = await this._git.getFetchRemotes(root);
		if (remotes === undefined) {
			throw new Error('Mission Control repository remotes could not be resolved');
		}
		const origin = remotes.find(remote => remote.name === 'origin');
		const remoteProject = origin && projectFromRemote(origin.url);
		if (remoteProject) {
			return remoteProject;
		}
		const localRoot = projectUri?.scheme === Schemas.file ? projectUri : await tryResolvePrimaryWorktreeRoot(this._git, root) ?? root;
		return { uri: localRoot.toString(), display_name: basename(localRoot.fsPath) || localRoot.toString() };
	}
}

function projectFromRemote(remote: string): IMissionControlMirrorProject | undefined {
	if (/^[a-zA-Z]:[\\/]/.test(remote.trim())) {
		return undefined;
	}
	const scp = remote.includes('://') ? undefined : /^(?:[^@/:\s]+@)?(?<host>[^/:\s]+):(?<path>.+)$/.exec(remote.trim());
	let url: URL;
	try {
		url = new URL(scp?.groups ? `ssh://${scp.groups.host}/${scp.groups.path}` : remote.trim());
	} catch {
		return undefined;
	}
	if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) || !url.hostname || url.search || url.hash) {
		return undefined;
	}
	const path = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
	if (!/^[^/\s]+\/[^/\s]+(?:\/[^/\s]+)*$/.test(path)) {
		return undefined;
	}
	return { uri: `https://${url.hostname}/${path}`, display_name: path };
}
