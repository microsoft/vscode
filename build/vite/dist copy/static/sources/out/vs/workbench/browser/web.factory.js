/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Menu } from './web.api.js';
import { BrowserMain } from './web.main.js';
import { URI } from '../../base/common/uri.js';
import { toDisposable } from '../../base/common/lifecycle.js';
import { CommandsRegistry } from '../../platform/commands/common/commands.js';
import { mark } from '../../base/common/performance.js';
import { MenuId, MenuRegistry } from '../../platform/actions/common/actions.js';
import { DeferredPromise } from '../../base/common/async.js';
import { asArray } from '../../base/common/arrays.js';
let created = false;
const workbenchPromise = new DeferredPromise();
/**
 * Creates the workbench with the provided options in the provided container.
 *
 * @param domElement the container to create the workbench in
 * @param options for setting up the workbench
 */
export function create(domElement, options) {
    // Mark start of workbench
    mark('code/didLoadWorkbenchMain');
    // Assert that the workbench is not created more than once. We currently
    // do not support this and require a full context switch to clean-up.
    if (created) {
        throw new Error('Unable to create the VSCode workbench more than once.');
    }
    else {
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
    let instantiatedWorkbench = undefined;
    new BrowserMain(domElement, options).open().then(workbench => {
        instantiatedWorkbench = workbench;
        workbenchPromise.complete(workbench);
    });
    return toDisposable(() => {
        if (instantiatedWorkbench) {
            instantiatedWorkbench.shutdown();
        }
        else {
            workbenchPromise.p.then(instantiatedWorkbench => instantiatedWorkbench.shutdown());
        }
    });
}
function asMenuId(menu) {
    switch (menu) {
        case Menu.CommandPalette: return MenuId.CommandPalette;
        case Menu.StatusBarWindowIndicatorMenu: return MenuId.StatusBarWindowIndicatorMenu;
    }
}
export var commands;
(function (commands) {
    /**
     * {@linkcode IWorkbench.commands IWorkbench.commands.executeCommand}
     */
    async function executeCommand(command, ...args) {
        const workbench = await workbenchPromise.p;
        return workbench.commands.executeCommand(command, ...args);
    }
    commands.executeCommand = executeCommand;
})(commands || (commands = {}));
export var logger;
(function (logger) {
    /**
     * {@linkcode IWorkbench.logger IWorkbench.logger.log}
     */
    function log(level, message) {
        workbenchPromise.p.then(workbench => workbench.logger.log(level, message));
    }
    logger.log = log;
})(logger || (logger = {}));
export var env;
(function (env) {
    /**
     * {@linkcode IWorkbench.env IWorkbench.env.retrievePerformanceMarks}
     */
    async function retrievePerformanceMarks() {
        const workbench = await workbenchPromise.p;
        return workbench.env.retrievePerformanceMarks();
    }
    env.retrievePerformanceMarks = retrievePerformanceMarks;
    /**
     * {@linkcode IWorkbench.env IWorkbench.env.getUriScheme}
     */
    async function getUriScheme() {
        const workbench = await workbenchPromise.p;
        return workbench.env.getUriScheme();
    }
    env.getUriScheme = getUriScheme;
    /**
     * {@linkcode IWorkbench.env IWorkbench.env.openUri}
     */
    async function openUri(target) {
        const workbench = await workbenchPromise.p;
        return workbench.env.openUri(URI.isUri(target) ? target : URI.from(target));
    }
    env.openUri = openUri;
})(env || (env = {}));
export var window;
(function (window) {
    /**
     * {@linkcode IWorkbench.window IWorkbench.window.withProgress}
     */
    async function withProgress(options, task) {
        const workbench = await workbenchPromise.p;
        return workbench.window.withProgress(options, task);
    }
    window.withProgress = withProgress;
    async function createTerminal(options) {
        const workbench = await workbenchPromise.p;
        workbench.window.createTerminal(options);
    }
    window.createTerminal = createTerminal;
    async function showInformationMessage(message, ...items) {
        const workbench = await workbenchPromise.p;
        return await workbench.window.showInformationMessage(message, ...items);
    }
    window.showInformationMessage = showInformationMessage;
})(window || (window = {}));
export var workspace;
(function (workspace) {
    /**
     * {@linkcode IWorkbench.workspace IWorkbench.workspace.didResolveRemoteAuthority}
     */
    async function didResolveRemoteAuthority() {
        const workbench = await workbenchPromise.p;
        await workbench.workspace.didResolveRemoteAuthority();
    }
    workspace.didResolveRemoteAuthority = didResolveRemoteAuthority;
    /**
     * {@linkcode IWorkbench.workspace IWorkbench.workspace.openTunnel}
     */
    async function openTunnel(tunnelOptions) {
        const workbench = await workbenchPromise.p;
        return workbench.workspace.openTunnel(tunnelOptions);
    }
    workspace.openTunnel = openTunnel;
})(workspace || (workspace = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViLmZhY3RvcnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci93ZWIuZmFjdG9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQXNFLElBQUksRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQzVDLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sMEJBQTBCLENBQUM7QUFDOUQsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxJQUFJLEVBQW1CLE1BQU0sa0NBQWtDLENBQUM7QUFDekUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBS3RELElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQztBQUNwQixNQUFNLGdCQUFnQixHQUFHLElBQUksZUFBZSxFQUFjLENBQUM7QUFFM0Q7Ozs7O0dBS0c7QUFDSCxNQUFNLFVBQVUsTUFBTSxDQUFDLFVBQXVCLEVBQUUsT0FBc0M7SUFFckYsMEJBQTBCO0lBQzFCLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO0lBRWxDLHdFQUF3RTtJQUN4RSxxRUFBcUU7SUFDckUsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQztJQUMxRSxDQUFDO1NBQU0sQ0FBQztRQUNQLE9BQU8sR0FBRyxJQUFJLENBQUM7SUFDaEIs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