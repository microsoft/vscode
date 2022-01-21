/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommand, ICommonTelemetryPropertiesResolver, IDefaultEditor, IDefaultLayout, IDefaultView, IDevelopmentOptions, IExternalUriResolver, IExternalURLOpener, IHomeIndicator, IInitialColorTheme, IPosition, IProductQualityChangeHandler, IRange, IResourceUriProvider, ISettingsSyncOptions, IShowPortCandidate, ITunnel, ITunnelFactory, ITunnelOptions, ITunnelProvider, IWelcomeBanner, IWelcomeBannerAction, IWindowIndicator, IWorkbenchConstructionOptions, Menu } from 'vs/workbench/browser/web.api';
import { IWorkbench, main } from 'vs/workbench/browser/web.main';
import { UriComponents, URI } from 'vs/base/common/uri';
import { IWebSocketFactory, IWebSocket } from 'vs/platform/remote/browser/browserSocketFactory';
import { IURLCallbackProvider } from 'vs/workbench/services/url/browser/urlService';
import { LogLevel } from 'vs/platform/log/common/log';
import { IUpdateProvider, IUpdate } from 'vs/workbench/services/update/browser/updateService';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IWorkspaceProvider, IWorkspace } from 'vs/workbench/services/host/browser/browserHostService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IProductConfiguration } from 'vs/base/common/product';
import { mark, PerformanceMark } from 'vs/base/common/performance';
import { ICredentialsProvider } from 'vs/platform/credentials/common/credentials';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { DeferredPromise } from 'vs/base/common/async';
import { asArray } from 'vs/base/common/arrays';

function asMenuId(menu: Menu): MenuId {
	switch (menu) {
		case Menu.CommandPalette: return MenuId.CommandPalette;
		case Menu.StatusBarWindowIndicatorMenu: return MenuId.StatusBarWindowIndicatorMenu;
	}
}

/**
 * Creates the workbench with the provided options in the provided container.
 *
 * @param domElement the container to create the workbench in
 * @param options for setting up the workbench
 */
let created = false;
const workbenchPromise = new DeferredPromise<IWorkbench>();
function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): IDisposable {

	// Mark start of workbench
	mark('code/didLoadWorkbenchMain');

	// Assert that the workbench is not created more than once. We currently
	// do not support this and require a full context switch to clean-up.
	if (created) {
		throw new Error('Unable to create the VSCode workbench more than once.');
	} else {
		created = true;
	}

	// Register commands if any
	if (Array.isArray(options.commands)) {
		for (const c of options.commands) {
			const command: ICommand = c;

			CommandsRegistry.registerCommand(command.id, (accessor, ...args) => {
				// we currently only pass on the arguments but not the accessor
				// to the command to reduce our exposure of internal API.
				return command.handler(...args);
			});

			// Commands with labels appear in the command palette
			if (command.label) {
				for (const menu of asArray(command.menu ?? Menu.CommandPalette)) {
					MenuRegistry.appendMenuItem(asMenuId(menu), { command: { id: command.id, title: command.label } });
				}
			}
		}
	}

	CommandsRegistry.registerCommand('_workbench.getTarballProxyEndpoints', () => (options._tarballProxyEndpoints ?? {}));

	// Startup workbench and resolve waiters
	let instantiatedWorkbench: IWorkbench | undefined = undefined;
	main(domElement, options).then(workbench => {
		instantiatedWorkbench = workbench;
		workbenchPromise.complete(workbench);
	});

	return toDisposable(() => {
		if (instantiatedWorkbench) {
			instantiatedWorkbench.shutdown();
		} else {
			workbenchPromise.p.then(instantiatedWorkbench => instantiatedWorkbench.shutdown());
		}
	});
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
		const workbench = await workbenchPromise.p;

		return workbench.commands.executeCommand(command, ...args);
	}
}

namespace env {

	/**
	 * Retrieve performance marks that have been collected during startup. This function
	 * returns tuples of source and marks. A source is a dedicated context, like
	 * the renderer or an extension host.
	 *
	 * *Note* that marks can be collected on different machines and in different processes
	 * and that therefore "different clocks" are used. So, comparing `startTime`-properties
	 * across contexts should be taken with a grain of salt.
	 *
	 * @returns A promise that resolves to tuples of source and marks.
	 */
	export async function retrievePerformanceMarks(): Promise<[string, readonly PerformanceMark[]][]> {
		const workbench = await workbenchPromise.p;

		return workbench.env.retrievePerformanceMarks();
	}

	/**
	 * @returns the scheme to use for opening the associated desktop
	 * experience via protocol handler.
	 */
	export async function getUriScheme(): Promise<string> {
		const workbench = await workbenchPromise.p;

		return workbench.env.uriScheme;
	}

	/**
	 * Allows to open a `URI` with the standard opener service of the
	 * workbench.
	 */
	export async function openUri(target: URI): Promise<boolean> {
		const workbench = await workbenchPromise.p;

		return workbench.env.openUri(target);
	}
}

export {

	// Factory
	create,
	IWorkbenchConstructionOptions,
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

	// WebSockets
	IWebSocketFactory,
	IWebSocket,

	// Resources
	IResourceUriProvider,

	// Credentials
	ICredentialsProvider,

	// Callbacks
	IURLCallbackProvider,

	// LogLevel
	LogLevel,

	// SettingsSync
	ISettingsSyncOptions,

	// Updates/Quality
	IUpdateProvider,
	IUpdate,
	IProductQualityChangeHandler,

	// Telemetry
	ICommonTelemetryPropertiesResolver,

	// External Uris
	IExternalUriResolver,

	// External URL Opener
	IExternalURLOpener,

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
	Menu,

	// Branding
	IHomeIndicator,
	IWelcomeBanner,
	IWelcomeBannerAction,
	IProductConfiguration,
	IWindowIndicator,
	IInitialColorTheme,

	// Default layout
	IDefaultView,
	IDefaultEditor,
	IDefaultLayout,
	IPosition,
	IRange as ISelection,

	// Env
	env,

	// Development
	IDevelopmentOptions
};

//#endregion
