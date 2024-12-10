/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	/**
	 * Used as part of the ResolverResult if the extension has any candidate,
	 * published, or forwarded ports.
	 */
	export interface TunnelInformation {
		/**
		 * Tunnels that are detected by the extension. The remotePort is used for display purposes.
		 * The localAddress should be the complete local address (ex. localhost:1234) for connecting to the port. Tunnels provided through
		 * environmentTunnels are read-only from the forwarded ports UI.
		 */
		environmentTunnels?: TunnelDescription[];

		tunnelFeatures?: {
			elevation: boolean;
			/**
			 * One of the the options must have the ID "private".
			 */
			privacyOptions: TunnelPrivacy[];
			/**
			 * Defaults to true for backwards compatibility.
			 */
			protocol?: boolean;
		};
	}

	export interface TunnelProvider {
		/**
		 * Provides port forwarding capabilities. If there is a resolver that already provids tunnels, then the resolver's provider will
		 * be used. If multiple providers are registered, then only the first will be used.
		 */
		provideTunnel(tunnelOptions: TunnelOptions, tunnelCreationOptions: TunnelCreationOptions, token: CancellationToken): ProviderResult<Tunnel>;
	}

	export namespace workspace {
		/**
		 * Registering a tunnel provider enables port forwarding. This will cause the Ports view to show.
		 * @param provider
		 */
		export function registerTunnelProvider(provider: TunnelProvider, information: TunnelInformation): Thenable<Disposable>;
	}

}
