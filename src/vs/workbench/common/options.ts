/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';

export interface IStaticExtension {
	packageJSON: IExtensionManifest;
	extensionLocation: URI;
	isBuiltin?: boolean;
}

export interface ITunnelProvider {

	/**
	 * Support for creating tunnels.
	 */
	tunnelFactory?: ITunnelFactory;

	/**
	 * Support for filtering candidate ports
	 */
	showPortCandidate?: IShowPortCandidate;
}

export interface ITunnelFactory {
	(tunnelOptions: ITunnelOptions): Promise<ITunnel> | undefined;
}

export interface ITunnelOptions {
	remoteAddress: { port: number, host: string };

	/**
	 * The desired local port. If this port can't be used, then another will be chosen.
	 */
	localAddressPort?: number;

	label?: string;
}

export interface ITunnel extends IDisposable {
	remoteAddress: { port: number, host: string };

	/**
	 * The complete local address(ex. localhost:1234)
	 */
	localAddress: string;

	/**
	 * Implementers of Tunnel should fire onDidDispose when dispose is called.
	 */
	onDidDispose: Event<void>;
}

export interface IShowPortCandidate {
	(host: string, port: number, detail: string): Promise<boolean>;
}

export interface IWorkbenchConstructionOptions {
	/**
	 * Add static extensions that cannot be uninstalled but only be disabled.
	 */
	readonly staticExtensions?: ReadonlyArray<IStaticExtension>;

	/**
	 * A provider for supplying tunneling functionality,
	 * such as creating tunnels and showing candidate ports to forward.
	 */
	readonly tunnelProvider?: ITunnelProvider;
}
