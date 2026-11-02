/*---------------------------------------------------------------------------------------------
 *  Disabled Remote API bridges for profiles without remote workspace support.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadManagedSocketsShape, MainThreadTunnelServiceShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadTunnelService)
export class MainThreadTunnelServiceDisabled extends Disposable implements MainThreadTunnelServiceShape {
	constructor(_context: IExtHostContext) { super(); }
	$openTunnel(..._args: Parameters<MainThreadTunnelServiceShape['$openTunnel']>): Promise<undefined> { return Promise.resolve(undefined); }
	$closeTunnel(..._args: Parameters<MainThreadTunnelServiceShape['$closeTunnel']>): Promise<void> { return Promise.resolve(); }
	$getTunnels(..._args: Parameters<MainThreadTunnelServiceShape['$getTunnels']>): ReturnType<MainThreadTunnelServiceShape['$getTunnels']> { return Promise.resolve([]); }
	$setTunnelProvider(..._args: Parameters<MainThreadTunnelServiceShape['$setTunnelProvider']>): Promise<void> { return Promise.resolve(); }
	$hasTunnelProvider(..._args: Parameters<MainThreadTunnelServiceShape['$hasTunnelProvider']>): Promise<boolean> { return Promise.resolve(false); }
	$setRemoteTunnelService(..._args: Parameters<MainThreadTunnelServiceShape['$setRemoteTunnelService']>): Promise<void> { return Promise.resolve(); }
	$setCandidateFilter(..._args: Parameters<MainThreadTunnelServiceShape['$setCandidateFilter']>): Promise<void> { return Promise.resolve(); }
	$onFoundNewCandidates(..._args: Parameters<MainThreadTunnelServiceShape['$onFoundNewCandidates']>): Promise<void> { return Promise.resolve(); }
	$setCandidatePortSource(..._args: Parameters<MainThreadTunnelServiceShape['$setCandidatePortSource']>): Promise<void> { return Promise.resolve(); }
	$registerPortsAttributesProvider(..._args: Parameters<MainThreadTunnelServiceShape['$registerPortsAttributesProvider']>): Promise<void> { return Promise.resolve(); }
	$unregisterPortsAttributesProvider(..._args: Parameters<MainThreadTunnelServiceShape['$unregisterPortsAttributesProvider']>): Promise<void> { return Promise.resolve(); }
}

@extHostNamedCustomer(MainContext.MainThreadManagedSockets)
export class MainThreadManagedSocketsDisabled extends Disposable implements MainThreadManagedSocketsShape {
	constructor(_context: IExtHostContext) { super(); }
	$registerSocketFactory(..._args: Parameters<MainThreadManagedSocketsShape['$registerSocketFactory']>): Promise<void> { return Promise.resolve(); }
	$unregisterSocketFactory(..._args: Parameters<MainThreadManagedSocketsShape['$unregisterSocketFactory']>): Promise<void> { return Promise.resolve(); }
	$onDidManagedSocketHaveData(..._args: Parameters<MainThreadManagedSocketsShape['$onDidManagedSocketHaveData']>): void { }
	$onDidManagedSocketClose(..._args: Parameters<MainThreadManagedSocketsShape['$onDidManagedSocketClose']>): void { }
	$onDidManagedSocketEnd(..._args: Parameters<MainThreadManagedSocketsShape['$onDidManagedSocketEnd']>): void { }
}
