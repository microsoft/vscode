/*---------------------------------------------------------------------------------------------
 *  Disabled Debug API bridge for profiles without Debug service support.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadDebugServiceShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadDebugService)
export class MainThreadDebugServiceDisabled extends Disposable implements MainThreadDebugServiceShape {
	constructor(_context: IExtHostContext) {
		super();
	}

	$registerDebugTypes(..._args: Parameters<MainThreadDebugServiceShape['$registerDebugTypes']>): void { }
	$sessionCached(..._args: Parameters<MainThreadDebugServiceShape['$sessionCached']>): void { }
	$acceptDAMessage(..._args: Parameters<MainThreadDebugServiceShape['$acceptDAMessage']>): void { }
	$acceptDAError(..._args: Parameters<MainThreadDebugServiceShape['$acceptDAError']>): void { }
	$acceptDAExit(..._args: Parameters<MainThreadDebugServiceShape['$acceptDAExit']>): void { }
	$registerDebugConfigurationProvider(..._args: Parameters<MainThreadDebugServiceShape['$registerDebugConfigurationProvider']>): Promise<void> { return Promise.resolve(); }
	$registerDebugAdapterDescriptorFactory(..._args: Parameters<MainThreadDebugServiceShape['$registerDebugAdapterDescriptorFactory']>): Promise<void> { return Promise.resolve(); }
	$unregisterDebugConfigurationProvider(..._args: Parameters<MainThreadDebugServiceShape['$unregisterDebugConfigurationProvider']>): void { }
	$unregisterDebugAdapterDescriptorFactory(..._args: Parameters<MainThreadDebugServiceShape['$unregisterDebugAdapterDescriptorFactory']>): void { }
	$startDebugging(..._args: Parameters<MainThreadDebugServiceShape['$startDebugging']>): Promise<boolean> { return Promise.resolve(false); }
	$stopDebugging(..._args: Parameters<MainThreadDebugServiceShape['$stopDebugging']>): Promise<void> { return Promise.resolve(); }
	$setDebugSessionName(..._args: Parameters<MainThreadDebugServiceShape['$setDebugSessionName']>): void { }
	$customDebugAdapterRequest(..._args: Parameters<MainThreadDebugServiceShape['$customDebugAdapterRequest']>): Promise<unknown> { return Promise.resolve(undefined); }
	$getDebugProtocolBreakpoint(..._args: Parameters<MainThreadDebugServiceShape['$getDebugProtocolBreakpoint']>): Promise<undefined> { return Promise.resolve(undefined); }
	$appendDebugConsole(..._args: Parameters<MainThreadDebugServiceShape['$appendDebugConsole']>): void { }
	$registerBreakpoints(..._args: Parameters<MainThreadDebugServiceShape['$registerBreakpoints']>): Promise<void> { return Promise.resolve(); }
	$unregisterBreakpoints(..._args: Parameters<MainThreadDebugServiceShape['$unregisterBreakpoints']>): Promise<void> { return Promise.resolve(); }
	$registerDebugVisualizer(..._args: Parameters<MainThreadDebugServiceShape['$registerDebugVisualizer']>): void { }
	$unregisterDebugVisualizer(..._args: Parameters<MainThreadDebugServiceShape['$unregisterDebugVisualizer']>): void { }
	$registerDebugVisualizerTree(..._args: Parameters<MainThreadDebugServiceShape['$registerDebugVisualizerTree']>): void { }
	$unregisterDebugVisualizerTree(..._args: Parameters<MainThreadDebugServiceShape['$unregisterDebugVisualizerTree']>): void { }
}
