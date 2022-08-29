/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	//resolvers: @alexdima

	export interface MessageOptions {
		/**
		 * Do not render a native message box.
		 */
		useCustom?: boolean;
	}

	export interface RemoteAuthorityResolverContext {
		resolveAttempt: number;
	}

	export class ResolvedAuthority {
		readonly host: string;
		readonly port: number;
		readonly connectionToken: string | undefined;

		constructor(host: string, port: number, connectionToken?: string);
	}

	export interface ResolvedOptions {
		extensionHostEnv?: { [key: string]: string | null };

		isTrusted?: boolean;

		/**
		 * When provided, remote server will be initialized with the extensions synced using the given user account.
		 */
		authenticationSessionForInitializingExtensions?: AuthenticationSession & { providerId: string };
	}

	export interface TunnelPrivacy {
		themeIcon: string;
		id: string;
		label: string;
	}

	export interface TunnelOptions {
		remoteAddress: { port: number; host: string };
		// The desired local port. If this port can't be used, then another will be chosen.
		localAddressPort?: number;
		label?: string;
		/**
		 * @deprecated Use privacy instead
		 */
		public?: boolean;
		privacy?: string;
		protocol?: string;
	}

	export interface TunnelDescription {
		remoteAddress: { port: number; host: string };
		//The complete local address(ex. localhost:1234)
		localAddress: { port: number; host: string } | string;
		/**
		 * @deprecated Use privacy instead
		 */
		public?: boolean;
		privacy?: string;
		// If protocol is not provided it is assumed to be http, regardless of the localAddress.
		protocol?: string;
	}

	export interface Tunnel extends TunnelDescription {
		// Implementers of Tunnel should fire onDidDispose when dispose is called.
		onDidDispose: Event<void>;
		dispose(): void | Thenable<void>;
	}

	/**
	 * Used as part of the ResolverResult if the extension has any candidate,
	 * published, or forwarded ports.
	 */
	export interface TunnelInformation {
		/**
		 * Tunnels that are detected by the extension. The remotePort is used for display purposes.
		 * The localAddress should be the complete local address (ex. localhost:1234) for connecting to the port. Tunnels provided through
		 * detected are read-only from the forwarded ports UI.
		 */
		environmentTunnels?: TunnelDescription[];

		tunnelFeatures?: {
			elevation: boolean;
			/**
			 * One of the the options must have the ID "private".
			 */
			privacyOptions: TunnelPrivacy[];
		};
	}

	export interface TunnelCreationOptions {
		/**
		 * True when the local operating system will require elevation to use the requested local port.
		 */
		elevationRequired?: boolean;
	}

	export enum CandidatePortSource {
		None = 0,
		Process = 1,
		Output = 2
	}

	export type ResolverResult = ResolvedAuthority & ResolvedOptions & TunnelInformation;

	export class RemoteAuthorityResolverError extends Error {
		static NotAvailable(message?: string, handled?: boolean): RemoteAuthorityResolverError;
		static TemporarilyNotAvailable(message?: string): RemoteAuthorityResolverError;

		constructor(message?: string);
	}

	export interface RemoteAuthorityResolver {
		/**
		 * Resolve the authority part of the current opened `vscode-remote://` URI.
		 *
		 * This method will be invoked once during the startup of the editor and again each time
		 * the editor detects a disconnection.
		 *
		 * @param authority The authority part of the current opened `vscode-remote://` URI.
		 * @param context A context indicating if this is the first call or a subsequent call.
		 */
		resolve(authority: string, context: RemoteAuthorityResolverContext): ResolverResult | Thenable<ResolverResult>;

		/**
		 * Get the canonical URI (if applicable) for a `vscode-remote://` URI.
		 *
		 * @returns The canonical URI or undefined if the uri is already canonical.
		 */
		getCanonicalURI?(uri: Uri): ProviderResult<Uri>;

		/**
		 * Can be optionally implemented if the extension can forward ports better than the core.
		 * When not implemented, the core will use its default forwarding logic.
		 * When implemented, the core will use this to forward ports.
		 *
		 * To enable the "Change Local Port" action on forwarded ports, make sure to set the `localAddress` of
		 * the returned `Tunnel` to a `{ port: number, host: string; }` and not a string.
		 */
		tunnelFactory?: (tunnelOptions: TunnelOptions, tunnelCreationOptions: TunnelCreationOptions) => Thenable<Tunnel> | undefined;

		/**p
		 * Provides filtering for candidate ports.
		 */
		showCandidatePort?: (host: string, port: number, detail: string) => Thenable<boolean>;

		/**
		 * @deprecated Return tunnelFeatures as part of the resolver result in tunnelInformation.
		 */
		tunnelFeatures?: {
			elevation: boolean;
			public: boolean;
			privacyOptions: TunnelPrivacy[];
		};

		candidatePortSource?: CandidatePortSource;
	}

	export namespace workspace {
		/**
		 * Forwards a port. If the current resolver implements RemoteAuthorityResolver:forwardPort then that will be used to make the tunnel.
		 * By default, openTunnel only support localhost; however, RemoteAuthorityResolver:tunnelFactory can be used to support other ips.
		 *
		 * @throws When run in an environment without a remote.
		 *
		 * @param tunnelOptions The `localPort` is a suggestion only. If that port is not available another will be chosen.
		 */
		export function openTunnel(tunnelOptions: TunnelOptions): Thenable<Tunnel>;

		/**
		 * Gets an array of the currently available tunnels. This does not include environment tunnels, only tunnels that have been created by the user.
		 * Note that these are of type TunnelDescription and cannot be disposed.
		 */
		// export let tunnels: Thenable<TunnelDescription[]>;

		/**
		 * Fired when the list of tunnels has changed.
		 */
		export const onDidChangeTunnels: Event<void>;
	}

	export interface ResourceLabelFormatter {
		scheme: string;
		authority?: string;
		formatting: ResourceLabelFormatting;
	}

	export interface ResourceLabelFormatting {
		label: string; // myLabel:/${path}
		// For historic reasons we use an or string here. Once we finalize this API we should start using enums instead and adopt it in extensions.
		// eslint-disable-next-line vscode-dts-literal-or-types
		separator: '/' | '\\' | '';
		tildify?: boolean;
		normalizeDriveLetter?: boolean;
		workspaceSuffix?: string;
		workspaceTooltip?: string;
		authorityPrefix?: string;
		stripPathStartingSeparator?: boolean;
	}

	export namespace workspace {
		export function registerRemoteAuthorityResolver(authorityPrefix: string, resolver: RemoteAuthorityResolver): Disposable;
		export function registerResourceLabelFormatter(formatter: ResourceLabelFormatter): Disposable;
	}

	export namespace env {

		/**
		 * The authority part of the current opened `vscode-remote://` URI.
		 * Defined by extensions, e.g. `ssh-remote+${host}` for remotes using a secure shell.
		 *
		 * *Note* that the value is `undefined` when there is no remote extension host but that the
		 * value is defined in all extension hosts (local and remote) in case a remote extension host
		 * exists. Use {@link Extension.extensionKind} to know if
		 * a specific extension runs remote or not.
		 */
		export const remoteAuthority: string | undefined;

	}
}
