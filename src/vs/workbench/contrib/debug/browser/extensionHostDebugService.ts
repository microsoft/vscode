/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionHostDebugService, IOpenExtensionWindowResult } from 'vs/platform/debug/common/extensionHostDebug';
import { ExtensionHostDebugBroadcastChannel, ExtensionHostDebugChannelClient } from 'vs/platform/debug/common/extensionHostDebugIpc';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { isFolderToOpen, isWorkspaceToOpen } from 'vs/platform/window/common/window';
import { IWorkspaceContextService, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier, hasWorkspaceFileExtension } from 'vs/platform/workspace/common/workspace';
import { IWorkspace, IWorkspaceProvider } from 'vs/workbench/browser/web.api';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

class BrowserExtensionHostDebugService extends ExtensionHostDebugChannelClient implements IExtensionHostDebugService {

	private static readonly LAST_EXTENSION_DEVELOPMENT_WORKSPACE_KEY = 'debug.lastExtensionDevelopmentWorkspace';

	private workspaceProvider: IWorkspaceProvider;

	private readonly storageService: IStorageService;
	private readonly fileService: IFileService;

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
		@IHostService hostService: IHostService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IFileService fileService: IFileService
	) {
		const connection = remoteAgentService.getConnection();
		let channel: IChannel;
		if (connection) {
			channel = connection.getChannel(ExtensionHostDebugBroadcastChannel.ChannelName);
		} else {
			// Extension host debugging not supported in serverless.
			channel = { call: async () => undefined, listen: () => Event.None } as any;
		}

		super(channel);

		this.storageService = storageService;
		this.fileService = fileService;

		if (environmentService.options && environmentService.options.workspaceProvider) {
			this.workspaceProvider = environmentService.options.workspaceProvider;
		} else {
			this.workspaceProvider = { open: async () => true, workspace: undefined, trusted: undefined };
			logService.warn('Extension Host Debugging not available due to missing workspace provider.');
		}

		// Reload window on reload request
		this._register(this.onReload(event => {
			if (environmentService.isExtensionDevelopment && environmentService.debugExtensionHost.debugId === event.sessionId) {
				hostService.reload();
			}
		}));

		// Close window on close request
		this._register(this.onClose(event => {
			if (environmentService.isExtensionDevelopment && environmentService.debugExtensionHost.debugId === event.sessionId) {
				hostService.close();
			}
		}));

		// Remember workspace as last used for extension development
		// (unless this is API tests) to restore for a future session
		if (environmentService.isExtensionDevelopment && !environmentService.extensionTestsLocationURI) {
			const workspaceId = toWorkspaceIdentifier(contextService.getWorkspace());
			if (isSingleFolderWorkspaceIdentifier(workspaceId) || isWorkspaceIdentifier(workspaceId)) {
				const serializedWorkspace = isSingleFolderWorkspaceIdentifier(workspaceId) ? { folderUri: workspaceId.uri.toJSON() } : { workspaceUri: workspaceId.configPath.toJSON() };
				storageService.store(BrowserExtensionHostDebugService.LAST_EXTENSION_DEVELOPMENT_WORKSPACE_KEY, JSON.stringify(serializedWorkspace), StorageScope.PROFILE, StorageTarget.MACHINE);
			} else {
				storageService.remove(BrowserExtensionHostDebugService.LAST_EXTENSION_DEVELOPMENT_WORKSPACE_KEY, StorageScope.PROFILE);
			}
		}
	}

	override async openExtensionDevelopmentHostWindow(args: string[], _debugRenderer: boolean): Promise<IOpenExtensionWindowResult> {

		// Add environment parameters required for debug to work
		const environment = new Map<string, string>();

		const fileUriArg = this.findArgument('file-uri', args);
		if (fileUriArg && !hasWorkspaceFileExtension(fileUriArg)) {
			environment.set('openFile', fileUriArg);
		}

		const copyArgs = [
			'extensionDevelopmentPath',
			'extensionTestsPath',
			'extensionEnvironment',
			'debugId',
			'inspect-brk-extensions',
			'inspect-extensions',
		];

		for (const argName of copyArgs) {
			const value = this.findArgument(argName, args);
			if (value) {
				environment.set(argName, value);
			}
		}

		// Find out which workspace to open debug window on
		let debugWorkspace: IWorkspace = undefined;
		const folderUriArg = this.findArgument('folder-uri', args);
		if (folderUriArg) {
			debugWorkspace = { folderUri: URI.parse(folderUriArg) };
		} else {
			const fileUriArg = this.findArgument('file-uri', args);
			if (fileUriArg && hasWorkspaceFileExtension(fileUriArg)) {
				debugWorkspace = { workspaceUri: URI.parse(fileUriArg) };
			}
		}

		const extensionTestsPath = this.findArgument('extensionTestsPath', args);
		if (!debugWorkspace && !extensionTestsPath) {
			const lastExtensionDevelopmentWorkspace = this.storageService.get(BrowserExtensionHostDebugService.LAST_EXTENSION_DEVELOPMENT_WORKSPACE_KEY, StorageScope.PROFILE);
			if (lastExtensionDevelopmentWorkspace) {
				try {
					const serializedWorkspace: { workspaceUri?: UriComponents; folderUri?: UriComponents } = JSON.parse(lastExtensionDevelopmentWorkspace);
					if (serializedWorkspace.workspaceUri) {
						debugWorkspace = { workspaceUri: URI.revive(serializedWorkspace.workspaceUri) };
					} else if (serializedWorkspace.folderUri) {
						debugWorkspace = { folderUri: URI.revive(serializedWorkspace.folderUri) };
					}
				} catch (error) {
					// ignore
				}
			}
		}

		// Validate workspace exists
		if (debugWorkspace) {
			const debugWorkspaceResource = isFolderToOpen(debugWorkspace) ? debugWorkspace.folderUri : isWorkspaceToOpen(debugWorkspace) ? debugWorkspace.workspaceUri : undefined;
			if (debugWorkspaceResource) {
				const workspaceExists = await this.fileService.exists(debugWorkspaceResource);
				if (!workspaceExists) {
					debugWorkspace = undefined;
				}
			}
		}

		// Open debug window as new window. Pass arguments over.
		const success = await this.workspaceProvider.open(debugWorkspace, {
			reuse: false, 								// debugging always requires a new window
			payload: Array.from(environment.entries())	// mandatory properties to enable debugging
		});

		return { success };
	}

	private findArgument(key: string, args: string[]): string | undefined {
		for (const a of args) {
			const k = `--${key}=`;
			if (a.indexOf(k) === 0) {
				return a.substring(k.length);
			}
		}

		return undefined;
	}
}

registerSingleton(IExtensionHostDebugService, BrowserExtensionHostDebugService, InstantiationType.Delayed);
