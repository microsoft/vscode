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
		/**
		 * Exec server from a recursively-resolved remote authority. If the
		 * remote authority includes nested authorities delimited by `@`, it is
		 * resolved from outer to inner authorities with ExecServer passed down
		 * to each resolver in the chain.
		 */
		execServer?: ExecServer;
	}

	export class ResolvedAuthority {
		readonly host: string;
		readonly port: number;
		readonly connectionToken: string | undefined;

		constructor(host: string, port: number, connectionToken?: string);
	}

	export interface ManagedMessagePassing {
		onDidReceiveMessage: Event<Uint8Array>;
		onDidClose: Event<Error | undefined>;
		onDidEnd: Event<void>;

		send: (data: Uint8Array) => void;
		end: () => void;
		drain?: () => Thenable<void>;
	}

	export class ManagedResolvedAuthority {
		readonly makeConnection: () => Thenable<ManagedMessagePassing>;
		readonly connectionToken: string | undefined;

		constructor(makeConnection: () => Thenable<ManagedMessagePassing>, connectionToken?: string);
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

	export namespace env {
		/** Quality of the application. May be undefined if running from sources. */
		export const appQuality: string | undefined;
		/** Commit of the application. May be undefined if running from sources. */
		export const appCommit: string | undefined;
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
			 * One of the options must have the ID "private".
			 */
			privacyOptions: TunnelPrivacy[];
			/**
			 * Defaults to true for backwards compatibility.
			 */
			protocol?: boolean;
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
		Output = 2,
		Hybrid = 3
	}

	export type ResolverResult = (ResolvedAuthority | ManagedResolvedAuthority) & ResolvedOptions & TunnelInformation;

	export class RemoteAuthorityResolverError extends Error {
		static NotAvailable(message?: string, handled?: boolean): RemoteAuthorityResolverError;
		static TemporarilyNotAvailable(message?: string): RemoteAuthorityResolverError;

		constructor(message?: string);
	}

	/**
	 * An ExecServer allows spawning processes on a remote machine. An ExecServer is provided by resolvers. It can be
	 * acquired by `workspace.getRemoteExecServer` or from the context when in a resolver (`RemoteAuthorityResolverContext.execServer`).
	 */
	export interface ExecServer {
		/**
		 * Spawns a given subprocess with the given command and arguments.
		 * @param command The command to execute.
		 * @param args The arguments to pass to the command.
		 * @param options Additional options for the spawned process.
		 * @returns A promise that gives access to the process' stdin, stdout and stderr streams, as well as the process' exit code.
		 */
		spawn(command: string, args: string[], options?: ExecServerSpawnOptions): Thenable<SpawnedCommand>;

		/**
		 * Spawns an connector that allows to start a remote server. It is assumed the command starts a Code CLI. Additional
		 * arguments will be passed to the connector.
		 * @param command The command to execute. It is assumed the command spawns a Code CLI executable.
		 * @param args The arguments to pass to the connector
		 * @param options Additional options for the spawned process.
		 * @returns A promise that gives access to the spawned {@link RemoteServerConnector}. It also provides a stream to which standard
		 * log messages are written.
		 */
		spawnRemoteServerConnector?(command: string, args: string[], options?: ExecServerSpawnOptions): Thenable<RemoteServerConnector>;

		/**
		 * Downloads the CLI executable of the desired platform and quality and pipes it to the
		 * provided process' stdin.
		 * @param buildTarget The CLI build target to download.
		 * @param command The command to execute. The downloaded bits will be piped to the command's stdin.
		 * @param args The arguments to pass to the command.
		 * @param options Additional options for the spawned process.
		 * @returns A promise that resolves when the process exits with a {@link ProcessExit} object.
		 */
		downloadCliExecutable?(buildTarget: CliBuild, command: string, args: string[], options?: ExecServerSpawnOptions): Thenable<ProcessExit>;

		/**
		 * Gets the environment where the exec server is running.
		 * @returns A promise that resolves to an {@link ExecEnvironment} object.
		 */
		env(): Thenable<ExecEnvironment>;

		/**
		 * Kills a process with the given ID.
		 *
		 * @param processId process ID to kill.
		 */
		kill(processId: number): Thenable<void>;

		/**
		 * Connects to the given TCP host/port on the remote.
		 *
		 * @param host The hostname or IP to connect to
		 * @param port The port number to connect to
		 * @returns a duplex stream, and a promise the resolves when both sides
		 * have closed.
		 */
		tcpConnect(
			host: string,
			port: number,
		): Thenable<{ stream: WriteStream & ReadStream; done: Thenable<void> }>;

		/**
		 * Access to the file system of the remote.
		 */
		readonly fs: RemoteFileSystem;
	}

	export type ProcessEnv = Record<string, string>;

	export interface ExecServerSpawnOptions {
		readonly env?: ProcessEnv;
		readonly cwd?: string;
	}

	export interface SpawnedCommand {
		readonly stdin: WriteStream;
		readonly stdout: ReadStream;
		readonly stderr: ReadStream;
		readonly onExit: Thenable<ProcessExit>;
	}

	export interface RemoteServerConnector {
		readonly logs: ReadStream;
		readonly onExit: Thenable<ProcessExit>;
		/**
		 * Connect to a new code server, returning a stream that can be used to communicate with it.
		 * @param params The parameters for the code server.
		 * @returns A promise that resolves to a {@link ManagedMessagePassing} object that can be used with a resolver
		 */
		connect(params: ServeParams): Thenable<ManagedMessagePassing>;
	}

	export interface ProcessExit {
		readonly status: number;
		readonly message?: string;
	}

	export interface ReadStream {
		readonly onDidReceiveMessage: Event<Uint8Array>;
		readonly onEnd: Thenable<void>;
	}

	export interface WriteStream {
		write(data: Uint8Array): void;
		end(): void;
	}

	export interface ServeParams {
		readonly socketId: number;
		readonly commit?: string;
		readonly quality: string;
		readonly extensions: string[];
		/** Whether server traffic should be compressed. */
		readonly compress?: boolean;
		/** Optional explicit connection token for the server. */
		readonly connectionToken?: string;
	}

	export interface CliBuild {
		readonly quality: string;
		/** 'LinuxAlpineX64' | 'LinuxAlpineARM64', 'LinuxX64' | 'LinuxARM64' | 'LinuxARM32' | 'DarwinX64' | 'DarwinARM64' | 'WindowsX64' | 'WindowsX86' | 'WindowsARM64' */
		readonly buildTarget: string;
		readonly commit: string;
	}

	export interface ExecEnvironment {
		readonly env: ProcessEnv;
		/** 'darwin' | 'linux' | 'win32' */
		readonly osPlatform: string;
		/** uname.version or windows version number, undefined if it could not be read. */
		readonly osRelease?: string;
	}

	export interface RemoteFileSystem {
		/**
		 * Retrieve metadata about a file.
		 *
		 * @param path The path of the file to retrieve metadata about.
		 * @returns The file metadata about the file.
		 * @throws an exception when `path` doesn't exist.
		 */
		stat(path: string): Thenable<FileStat>;

		/**
		 * Recursively creates the given directory on the remote.
		 *
		 * @param path The path of the folder to create
		 * @throws an exception when `path` is a file, or other i/o operations happen
		 */
		mkdirp(path: string): Thenable<void>;

		/**
		 * Recursively deletes the given path on the remote.
		 *
		 * @param path The path of the file or folder to delete.
		 * @throws if an i/o error happens during removal. It does not throw if
		 * the path already does not exist.
		 */
		rm(path: string): Thenable<void>;

		/**
		 * Reads the given file from the remote.
		 *
		 * @param path The path of the file to read.
		 * @throws if the path doesn't exist or can't be accessed
		 * @returns a readable stream of the file data
		 */
		read(path: string): Thenable<ReadStream>;

		/**
		 * Writes the given file on the remote. Truncates the file if it exists.
		 *
		 * @param path The path of the file to write.
		 * @throws if the path can't be accessed
		 * @returns a writable `stream` that accepts data, and a `done` promise that
		 * will resolve after `stream.end()` is called once the write is complete.
		 */
		write(path: string): Thenable<{ stream: WriteStream; done: Thenable<void> }>;

		/**
		 * Connects to the given unix socket or named pipe on the remote.
		 *
		 * @param path The path of the unix socket or named pipe
		 * @throws if the path can't be accessed
		 * @returns a duplex stream, and a promise the resolves when both sides
		 * have closed.
		 */
		connect(path: string): Thenable<{ stream: WriteStream & ReadStream; done: Thenable<void> }>;

		/**
		 * Renames the file.
		 *
		 * @param fromPath The existing file path.
		 * @param toPath The new file path.
		 * @throws if the original path doesn't exist, or the toPath can't be accessed
		 */
		rename(fromPath: string, toPath: string): Thenable<void>;

		/**
		 * Reads the contents of a directory.
		 *
		 * @param path The path of the folder to read.
		 * @throws if the folder doesn't exist
		 * @returns a list of directory entries
		 */
		readdir(path: string): Thenable<DirectoryEntry[]>;
	}

	export interface DirectoryEntry {
		/**
		 * The type of the file, e.g. is a regular file, a directory, or symbolic link
		 * to a file.
		 *
		 * *Note:* This value might be a bitmask, e.g. `FileType.File | FileType.SymbolicLink`.
		 */
		type: FileType;

		/**
		 * Non-absolute name of the file in the directory.
		 */
		name: string;
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
		 * Resolves an exec server interface for the authority. Called if an
		 * authority is a midpoint in a transit to the desired remote.
		 *
		 * @param authority The authority part of the current opened `vscode-remote://` URI.
		 * @returns The exec server interface, as defined in a contract between extensions.
		 */
		resolveExecServer?(remoteAuthority: string, context: RemoteAuthorityResolverContext): ExecServer | Thenable<ExecServer>;

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

	export interface ResourceLabelFormatter {
		scheme: string;
		authority?: string;
		formatting: ResourceLabelFormatting;
	}

	export interface ResourceLabelFormatting {
		label: string; // myLabel:/${path}
		// For historic reasons we use an or string here. Once we finalize this API we should start using enums instead and adopt it in extensions.
		// eslint-disable-next-line local/vscode-dts-literal-or-types, local/vscode-dts-string-type-literals
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
		export function getRemoteExecServer(authority: string): Thenable<ExecServer | undefined>;
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
