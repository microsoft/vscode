/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Sequencer } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { localize } from '../../../../../nls.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_TASK_SCHEME, cloudSandboxAddress, cloudSandboxTaskResource, ICloudSandboxTask } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { SessionStatus } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ChatSessionRefreshReason, ChatSessionStatus, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../common/chatSessionsService.js';
import { CloudSandboxSessionListController } from './cloudSandboxSessionListController.js';

interface ITaskListActions {
	refresh(token: CancellationToken, reason?: ChatSessionRefreshReason): Promise<void>;
	delete(taskId: string): Promise<void>;
	archive(taskId: string, archived: boolean): Promise<void>;
	archiveChat(resource: URI, archived: boolean): void;
	deleteChat(resource: URI, token: CancellationToken): Promise<void>;
	materialized(resource: URI): void;
}

export class CloudSandboxTaskListController extends Disposable implements IChatSessionItemController {
	private readonly _tasks = new Map<string, ICloudSandboxTask>();
	private readonly _liveItems = new Map<string, IChatSessionItem>();
	private readonly _liveOwners = new Map<string, CloudSandboxSessionListController>();
	private readonly _runtimeVisibility = new Map<string, boolean>();
	private readonly _providers = this._register(new DisposableMap<CloudSandboxSessionListController, DisposableStore>());
	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<IChatSessionItemsDelta>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;
	private _listed = new Map<string, IChatSessionItem>();
	private readonly _archiveSequencer = new Sequencer();
	private _generation = 0;

	constructor(
		private readonly _repositories: IObservable<ReadonlySet<string> | undefined>,
		private readonly _actions: ITaskListActions,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this._register(autorun(reader => {
			_repositories.read(reader);
			this._publish();
		}));
	}

	get items(): readonly IChatSessionItem[] { return [...this._listed.values()]; }

	clear(): void {
		this._generation++;
		this._providers.clearAndDisposeAll();
		this._tasks.clear();
		this._liveItems.clear();
		this._liveOwners.clear();
		this._runtimeVisibility.clear();
		this._publish();
	}

	update(tasks: readonly ICloudSandboxTask[], removed: readonly string[]): void {
		for (const taskId of removed) {
			this._tasks.delete(taskId);
			this._liveItems.delete(taskId);
			this._liveOwners.delete(taskId);
			this._runtimeVisibility.delete(taskId);
		}
		for (const task of tasks) {
			this._tasks.set(task.taskId, task);
		}
		this._publish();
	}

	attach(provider: CloudSandboxSessionListController, taskId: (resource: URI) => string | undefined): void {
		const update = () => {
			const visible = new Set<string>();
			for (const item of provider.items) {
				const id = taskId(item.resource);
				if (id) {
					visible.add(id);
					this._liveOwners.set(id, provider);
					this._runtimeVisibility.set(id, true);
					const resource = cloudSandboxTaskResource(id);
					this._liveItems.set(id, { ...item, resource, children: item.children?.map(child => ({ ...child, resource: resource.with({ fragment: child.resource.fragment, query: child.resource.query }) })) });
				}
			}
			for (const [id, owner] of this._liveOwners) {
				if (owner === provider && !visible.has(id)) {
					this._liveItems.delete(id);
					this._runtimeVisibility.set(id, false);
				}
			}
			this._publish();
		};
		if (!this._providers.has(provider)) {
			const store = new DisposableStore();
			this._providers.set(provider, store);
			store.add(provider.onDidChangeChatSessionItems(update));
		}
		update();
	}

	private _publish(): void {
		const repositories = this._repositories.get();
		const next = new Map<string, IChatSessionItem>();
		for (const task of this._tasks.values()) {
			if (this._runtimeVisibility.get(task.taskId) === false) {
				continue;
			}
			if (repositories && (!task.repoName || !repositories.has(task.repoName.toLowerCase()))) {
				continue;
			}
			const time = Date.parse(task.updatedAt ?? '') || 0;
			const live = this._liveItems.get(task.taskId);
			const legacyResource = this.getPreviousSessionResource(cloudSandboxTaskResource(task.taskId));
			next.set(task.taskId, live ? { ...live, archived: task.isArchived, legacyResource } : {
				resource: cloudSandboxTaskResource(task.taskId),
				legacyResource,
				label: task.name,
				iconPath: Codicon.cloud,
				description: task.repoName,
				archived: task.isArchived,
				status: task.status === SessionStatus.InProgress ? ChatSessionStatus.InProgress
					: task.status === SessionStatus.InputNeeded ? ChatSessionStatus.NeedsInput
						: task.status === SessionStatus.Error ? ChatSessionStatus.Failed : ChatSessionStatus.Completed,
				timing: { created: time, lastRequestStarted: time, lastRequestEnded: time },
			});
		}
		const removed = [...this._listed].filter(([id]) => !next.has(id)).map(([, item]) => item.resource);
		this._listed = next;
		if (next.size || removed.length) {
			this._onDidChangeChatSessionItems.fire({
				...(next.size ? { addedOrUpdated: [...next.values()] } : {}),
				...(removed.length ? { removed } : {}),
			});
		}
	}

	refresh(token: CancellationToken, reason?: ChatSessionRefreshReason): Promise<void> { return this._actions.refresh(token, reason); }
	getPreviousSessionResource(resource: URI): URI | undefined {
		const task = this._tasks.get(resource.path.slice(1));
		return task?.environmentId && task.sessionId
			? resource.with({
				scheme: remoteAgentHostSessionTypeId(agentHostAuthority(cloudSandboxAddress(task.environmentId)), CLOUD_SANDBOX_AGENT_PROVIDER),
				path: `/${task.sessionId}`,
			})
			: undefined;
	}

	async deleteChatSessionItem(resource: URI, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		this._requireTask(resource);
		if (resource.fragment || resource.query) {
			await this._actions.deleteChat(resource, token);
		} else {
			await this._actions.delete(resource.path.slice(1));
		}
	}
	setChatSessionItemArchived(resource: URI, archived: boolean): void {
		const generation = this._generation;
		void this._archiveSequencer.queue(async () => {
			if (this._store.isDisposed || generation !== this._generation) {
				throw new CancellationError();
			}
			this._requireTask(resource);
			if (resource.fragment || resource.query) {
				this._actions.archiveChat(resource, archived);
			} else {
				await this._actions.archive(resource.path.slice(1), archived);
			}
		}).catch(error => {
			if (!isCancellationError(error)) {
				this._notificationService.error(localize('cloudSandbox.archiveFailed', "Unable to change the sandbox session's archive state: {0}", toErrorMessage(error)));
			}
		});
	}

	notifySessionMaterialized(resource: URI): void {
		this._actions.materialized(resource);
	}

	private _requireTask(resource: URI): void {
		if (resource.scheme !== CLOUD_SANDBOX_TASK_SCHEME || resource.authority || !this._tasks.has(resource.path.slice(1))) {
			throw new Error(localize('cloudSandbox.invalidCatalogTask', "The conversation does not belong to this cloud task catalog."));
		}
	}
}
