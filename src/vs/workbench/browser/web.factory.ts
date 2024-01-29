/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITunnel, ITunnelOptions, IWorkbench, IWorkbenchConstructionOptions, Menu } from 'vs/workbench/browser/web.api';
import { BrowserMain } from 'vs/workbench/browser/web.main';
import { URI } from 'vs/base/common/uri';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { mark, PerformanceMark } from 'vs/base/common/performance';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { DeferredPromise } from 'vs/base/common/async';
import { asArray } from 'vs/base/common/arrays';
import { IProgress, IProgressCompositeOptions, IProgressDialogOptions, IProgressNotificationOptions, IProgressOptions, IProgressStep, IProgressWindowOptions } from 'vs/platform/progress/common/progress';
import { LogLevel } from 'vs/platform/log/common/log';
import { IEmbedderTerminalOptions } from 'vs/workbench/services/terminal/common/embedderTerminalService';

let created = false;
const workbenchPromise = new DeferredPromise<IWorkbench>();

/**
 * Creates the workbench with the provided options in the provided container.
 *
 * @param domElement the container to create the workbench in
 * @param options for setting up the workbench
 */
export function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): IDisposable {

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
		for (const command of options.commands) {

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

	// Startup workbench and resolve waiters
	let instantiatedWorkbench: IWorkbench | undefined = undefined;
	new BrowserMain(domElement, options).open().then(workbench => {
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

function asMenuId(menu: Menu): MenuId {
	switch (menu) {
		case Menu.CommandPalette: return MenuId.CommandPalette;
		case Menu.StatusBarWindowIndicatorMenu: return MenuId.StatusBarWindowIndicatorMenu;
	}
}

export namespace commands {

	/**
	 * {@linkcode IWorkbench.commands IWorkbench.commands.executeCommand}
	 */
	export async function executeCommand(command: string, ...args: any[]): Promise<unknown> {
		const workbench = await workbenchPromise.p;

		return workbench.commands.executeCommand(command, ...args);
	}
}

export namespace logger {

	/**
	 * {@linkcode IWorkbench.logger IWorkbench.logger.log}
	 */
	export function log(level: LogLevel, message: string) {
		workbenchPromise.p.then(workbench => workbench.logger.log(level, message));
	}
}

export namespace env {

	/**
	 * {@linkcode IWorkbench.env IWorkbench.env.retrievePerformanceMarks}
	 */
	export async function retrievePerformanceMarks(): Promise<[string, readonly PerformanceMark[]][]> {
		const workbench = await workbenchPromise.p;

		return workbench.env.retrievePerformanceMarks();
	}

	/**
	 * {@linkcode IWorkbench.env IWorkbench.env.getUriScheme}
	 */
	export async function getUriScheme(): Promise<string> {
		const workbench = await workbenchPromise.p;

		return workbench.env.getUriScheme();
	}

	/**
	 * {@linkcode IWorkbench.env IWorkbench.env.openUri}
	 */
	export async function openUri(target: URI): Promise<boolean> {
		const workbench = await workbenchPromise.p;

		return workbench.env.openUri(target);
	}
}

export namespace window {

	/**
	 * {@linkcode IWorkbench.window IWorkbench.window.withProgress}
	 */
	export async function withProgress<R>(
		options: IProgressOptions | IProgressDialogOptions | IProgressNotificationOptions | IProgressWindowOptions | IProgressCompositeOptions,
		task: (progress: IProgress<IProgressStep>) => Promise<R>
	): Promise<R> {
		const workbench = await workbenchPromise.p;

		return workbench.window.withProgress(options, task);
	}

	export async function createTerminal(options: IEmbedderTerminalOptions): Promise<void> {
		const workbench = await workbenchPromise.p;
		workbench.window.createTerminal(options);
	}
}

export namespace workspace {

	/**
	 * {@linkcode IWorkbench.workspace IWorkbench.workspace.openTunnel}
	 */
	export async function openTunnel(tunnelOptions: ITunnelOptions): Promise<ITunnel> {
		const workbench = await workbenchPromise.p;

		return workbench.workspace.openTunnel(tunnelOptions);
	}
}
