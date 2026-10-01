/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { CancellationError, getErrorMessage } from '../../../../../../base/common/errors.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentHostPluginManagementRequest, IAgentHostPluginManagementResult } from '../../../../../../platform/agentHost/common/agentHostPluginManagement.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../../platform/progress/common/progress.js';
import { IAICustomizationWorkspaceService, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import type { ICustomizationItem, ICustomizationItemAction, ICustomizationPluginManagementProvider } from '../../../common/customizationHarnessService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';

/** UI orchestration only; inventory, persistence and policy enforcement belong to the host SDK. */
export class AgentHostPluginManagementProvider extends Disposable implements ICustomizationPluginManagementProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	readonly installedPlugins = observableValue<readonly { readonly spec: string; readonly uri: URI }[] | undefined>(this, undefined);
	readonly inventoryError = observableValue<string | undefined>(this, undefined);
	private inventorySequence = 0;
	private inventoryContext: string | undefined;
	private readonly pendingInventory = new Map<string, Promise<IAgentHostPluginManagementResult>>();

	constructor(
		readonly providerId: string,
		private readonly connection: IAgentConnection,
		@IAgentHostCustomizationService private readonly customizationService: IAgentHostCustomizationService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProgressService private readonly progressService: IProgressService,
	) {
		super();
		this._register(customizationService.onDidChangeCustomizations(() => this._onDidChange.fire()));
		if (connection.onDidChangePluginManagement) {
			this._register(connection.onDidChangePluginManagement(provider => {
				if (provider === this.providerId) {
					this._onDidChange.fire();
				}
			}));
		}
	}

	private createRequest(sessionResource: URI, operation: IAgentHostPluginManagementRequest['operation'], target?: string, directSourceId?: string, marketplaceSource?: string): IAgentHostPluginManagementRequest {
		const directory = this.customizationService.getWorkingDirectories(sessionResource)[0];
		let root = directory ? URI.parse(directory) : undefined;
		if (!root) {
			const clientRoot = this.workspaceService.getActiveProjectRoot();
			root = clientRoot ? this.connection.resourceUris.toAgentHost(clientRoot) : undefined;
			if (root && !isEqual(this.connection.resourceUris.fromAgentHost(root), clientRoot)) {
				throw new Error(localize('pluginManagement.directoryWrongHost', "Select a project on this agent host before managing its plugins."));
			}
		}
		if (root && root.scheme !== Schemas.file) {
			throw new Error(localize('pluginManagement.directoryUnsupported', "The plugin working directory is not accessible on this agent host."));
		}
		return { provider: this.providerId, operation, target, directSourceId, marketplaceSource, workingDirectory: root?.toString() };
	}

	private async manage(request: IAgentHostPluginManagementRequest): Promise<IAgentHostPluginManagementResult> {
		const management = this.connection.pluginManagement;
		if (!management || !this.connection.pluginManagementProviders?.includes(this.providerId)) {
			throw new Error(localize('pluginManagement.unsupported', "This agent host does not support plugin management."));
		}
		const context = request.workingDirectory ?? '';
		if (context !== this.inventoryContext) {
			this.pendingInventory.clear();
			this.inventoryContext = context;
			this.installedPlugins.set(undefined, undefined);
			this.inventoryError.set(undefined, undefined);
		}
		const key = JSON.stringify(request);
		const isInventory = request.operation === 'list' || request.operation === 'browse';
		const pending = isInventory ? this.pendingInventory.get(key) : undefined;
		if (pending) {
			return pending;
		}
		const sequence = ++this.inventorySequence;
		const operation = (async () => {
			try {
				const result = await management.manage(request);
				if (sequence === this.inventorySequence) {
					this.installedPlugins.set(result.plugins.map(plugin => ({ spec: plugin.spec, uri: this.getPluginUri(plugin.spec, plugin.directSourceId) })), undefined);
					this.inventoryError.set(undefined, undefined);
				}
				return result;
			} catch (error) {
				if (sequence === this.inventorySequence) {
					this.inventoryError.set(getErrorMessage(error), undefined);
				}
				throw error;
			}
		})();
		if (isInventory) {
			this.pendingInventory.set(key, operation);
		}
		try {
			return await operation;
		} finally {
			if (this.pendingInventory.get(key) === operation) {
				this.pendingInventory.delete(key);
			}
		}
	}

	async getItems(sessionResource: URI, browse: boolean, token: CancellationToken): Promise<readonly ICustomizationItem[]> {
		let request: IAgentHostPluginManagementRequest;
		try {
			request = this.createRequest(sessionResource, browse ? 'browse' : 'list');
		} catch (error) {
			this.inventoryError.set(getErrorMessage(error), undefined);
			throw error;
		}
		const result = await this.manage(request);
		if (token.isCancellationRequested) {
			return [];
		}
		const installed = new Set(result.plugins.map(plugin => plugin.spec));
		if (browse) {
			return result.catalog.filter(plugin => !installed.has(plugin.spec)).map(plugin => ({
				uri: this.getPluginUri(plugin.spec),
				itemKey: plugin.spec,
				name: plugin.spec,
				description: plugin.description,
				type: 'plugin',
				extensionId: undefined,
				pluginUri: undefined,
				source: AICustomizationSources.user,
				groupKey: 'remote-host',
				actions: [{
					id: 'agentHost.plugin.install',
					label: localize('pluginManagement.install', "Install"),
					icon: Codicon.cloudDownload,
					run: async () => { await this.install(sessionResource, plugin.spec); },
				}],
			}));
		}
		return result.plugins.map(plugin => {
			const actions: ICustomizationItemAction[] = [];
			if (plugin.canToggle) {
				actions.push({
					id: 'agentHost.plugin.toggle',
					label: plugin.enabled ? localize('pluginManagement.disable', "Disable") : localize('pluginManagement.enable', "Enable"),
					run: () => this.mutate(this.createRequest(sessionResource, plugin.enabled ? 'disable' : 'enable', plugin.spec)),
				});
			}
			if (plugin.canUpdate) {
				actions.push({
					id: 'agentHost.plugin.update',
					label: localize('pluginManagement.update', "Update"),
					run: () => this.mutate(this.createRequest(sessionResource, 'update', plugin.spec)),
				});
			}
			if (plugin.canUninstall) {
				actions.push({
					id: 'agentHost.plugin.uninstall',
					label: localize('pluginManagement.uninstall', "Uninstall"),
					icon: Codicon.trash,
					run: async () => {
						const request = this.createRequest(sessionResource, 'uninstall', plugin.spec, plugin.directSourceId);
						const { confirmed } = await this.dialogService.confirm({
							message: localize('pluginManagement.uninstallConfirm', "Uninstall '{0}'?", plugin.spec),
							primaryButton: localize('pluginManagement.uninstall', "Uninstall"),
						});
						if (confirmed) {
							await this.mutate(request);
						}
					},
				});
			}
			return {
				uri: this.getPluginUri(plugin.spec, plugin.directSourceId),
				itemKey: plugin.directSourceId ?? plugin.spec,
				name: plugin.spec,
				description: plugin.version,
				type: 'plugin',
				extensionId: undefined,
				pluginUri: undefined,
				source: AICustomizationSources.user,
				groupKey: 'remote-host',
				enabled: plugin.enabled,
				actions,
			};
		});
	}

	getPluginUri(spec: string, directSourceId?: string): URI {
		return URI.from({ scheme: 'agent-host-plugin', authority: this.providerId, path: `/${spec}`, query: directSourceId ? new URLSearchParams({ source: directSourceId }).toString() : undefined });
	}

	async install(sessionResource: URI, source: string, marketplaceSource?: string, token = CancellationToken.None): Promise<boolean> {
		const request = this.createRequest(sessionResource, 'install', source, undefined, marketplaceSource);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: localize('pluginManagement.trust', "Trust Plugin '{0}'?", source),
			detail: localize('pluginManagement.trustDetail', "Plugins can run code on the agent host. Only install plugins from sources you trust."),
			primaryButton: localize('pluginManagement.trustInstall', "Trust and Install"),
		});
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!confirmed) {
			return false;
		}
		await this.mutate(request);
		return true;
	}

	async uninstall(sessionResource: URI, spec: string): Promise<void> {
		await this.mutate(this.createRequest(sessionResource, 'uninstall', spec));
	}

	private async mutate(request: IAgentHostPluginManagementRequest): Promise<void> {
		const { operation, target } = request;
		const title = operation === 'install'
			? localize('pluginManagement.installing', "Installing plugin '{0}'...", target)
			: localize('pluginManagement.updating', "Updating plugin '{0}'...", target);
		status(title);
		await this.progressService.withProgress({ location: ProgressLocation.Notification, title }, async () => {
			const result = await this.manage(request);
			for (const message of result.messages) {
				this.notificationService.info(message);
			}
		});
		this._onDidChange.fire();
		status(localize('pluginManagement.complete', "Plugin '{0}' updated.", target));
	}
}
