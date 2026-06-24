/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbench, IWorkbenchConstructionOptions } from '../../workbench/browser/web.api.js';
import { SessionsBrowserMain } from './web.main.js';
import { IDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { mark } from '../../base/common/performance.js';
import { DeferredPromise } from '../../base/common/async.js';
import { CommandsRegistry } from '../../platform/commands/common/commands.js';
import { MenuRegistry, MenuId } from '../../platform/actions/common/actions.js';

const workbenchPromise = new DeferredPromise<IWorkbench>();

/**
 * Creates the Sessions workbench with the provided options in the provided container.
 */
export function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): IDisposable {

	mark('code/didLoadWorkbenchMain');

	// Register embedder commands (same as workbench/browser/web.factory.ts)
	if (Array.isArray(options.commands)) {
		for (const command of options.commands) {
			CommandsRegistry.registerCommand(command.id, (_accessor, ...args) => {
				return command.handler(...args);
			});

			if (command.label) {
				MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: command.id, title: command.label } });
			}
		}
	}

	let instantiatedWorkbench: IWorkbench | undefined = undefined;
	new SessionsBrowserMain(domElement, options).open().then(workbench => {
		instantiatedWorkbench = workbench;
		workbenchPromise.complete(workbench);
	});

	return toDisposable(() => {
		if (instantiatedWorkbench) {
			instantiatedWorkbench.shutdown();
		} else {
			workbenchPromise.p.then(w => w.shutdown());
		}
	});
}
