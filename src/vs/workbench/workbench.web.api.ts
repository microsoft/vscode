/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/workbench.web.main';
import { main } from 'vs/workbench/browser/web.main';
import { UriComponents, URI } from 'vs/base/common/uri';
import { IFileSystemProvider, FileSystemProviderCapabilities, IFileChange, FileChangeType } from 'vs/platform/files/common/files';
import { IWebSocketFactory, IWebSocket } from 'vs/platform/remote/browser/browserSocketFactory';
import { ICredentialsProvider } from 'vs/workbench/services/credentials/browser/credentialsService';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { IURLCallbackProvider } from 'vs/workbench/services/url/browser/urlService';
import { LogLevel } from 'vs/platform/log/common/log';
import { IUpdateProvider, IUpdate } from 'vs/workbench/services/update/browser/updateService';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IWorkspaceProvider, IWorkspace } from 'vs/workbench/services/host/browser/browserHostService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IProductConfiguration } from 'vs/platform/product/common/productService';
import { mark } from 'vs/base/common/performance';
import { IStaticExtension, ITunnelProvider, ITunnelFactory, ITunnel, ITunnelOptions, IShowPortCandidate } from 'vs/workbench/common/options';
import { IBrowserWorkbenchConstructionOptions, IResourceUriProvider, IProductQualityChangeHandler, ICommonTelemetryPropertiesResolver, IExternalUriResolver, ICommand, IHomeIndicator, IDefaultView, IDefaultEditor, IDefaultLayout, IDefaultPanelLayout, IDefaultSideBarLayout } from 'vs/workbench/browser/options';

interface IWorkbench {
	commands: {
		executeCommand(command: string, ...args: any[]): Promise<unknown>;
	}
}

/**
 * Creates the workbench with the provided options in the provided container.
 *
 * @param domElement the container to create the workbench in
 * @param options for setting up the workbench
 */
let created = false;
let workbenchPromiseResolve: Function;
const workbenchPromise = new Promise<IWorkbench>(resolve => workbenchPromiseResolve = resolve);
async function create(domElement: HTMLElement, options: IBrowserWorkbenchConstructionOptions): Promise<void> {

	// Mark start of workbench
	mark('didLoadWorkbenchMain');
	performance.mark('workbench-start');

	// Assert that the workbench is not created more than once. We currently
	// do not support this and require a full context switch to clean-up.
	if (created) {
		throw new Error('Unable to create the VSCode workbench more than once.');
	} else {
		created = true;
	}

	// Startup workbench and resolve waiters
	const workbench = await main(domElement, options);
	workbenchPromiseResolve(workbench);

	// Register commands if any
	if (Array.isArray(options.commands)) {
		for (const command of options.commands) {
			CommandsRegistry.registerCommand(command.id, (accessor, ...args) => {
				// we currently only pass on the arguments but not the accessor
				// to the command to reduce our exposure of internal API.
				return command.handler(...args);
			});
		}
	}
}


//#region API Facade

namespace commands {

	/**
	* Allows to execute any command if known with the provided arguments.
	*
	* @param command Identifier of the command to execute.
	* @param rest Parameters passed to the command function.
	* @return A promise that resolves to the returned value of the given command.
	*/
	export async function executeCommand(command: string, ...args: any[]): Promise<unknown> {
		const workbench = await workbenchPromise;

		return workbench.commands.executeCommand(command, ...args);
	}
}

export {

	// Factory
	create,
	IBrowserWorkbenchConstructionOptions,
	IWorkbench,

	// Basic Types
	URI,
	UriComponents,
	Event,
	Emitter,
	IDisposable,
	Disposable,

	// Workspace
	IWorkspace,
	IWorkspaceProvider,

	// FileSystem
	IFileSystemProvider,
	FileSystemProviderCapabilities,
	IFileChange,
	FileChangeType,

	// WebSockets
	IWebSocketFactory,
	IWebSocket,

	// Resources
	IResourceUriProvider,

	// Credentials
	ICredentialsProvider,

	// Static Extensions
	IStaticExtension,
	IExtensionManifest,

	// Callbacks
	IURLCallbackProvider,

	// LogLevel
	LogLevel,

	// Updates/Quality
	IUpdateProvider,
	IUpdate,
	IProductQualityChangeHandler,

	// Telemetry
	ICommonTelemetryPropertiesResolver,

	// External Uris
	IExternalUriResolver,

	// Tunnel
	ITunnelProvider,
	ITunnelFactory,
	ITunnel,
	ITunnelOptions,

	// Ports
	IShowPortCandidate,

	// Commands
	ICommand,
	commands,

	// Branding
	IHomeIndicator,
	IProductConfiguration,

	// Default layout
	IDefaultView,
	IDefaultEditor,
	IDefaultLayout,
	IDefaultPanelLayout,
	IDefaultSideBarLayout
};

//#endregion
