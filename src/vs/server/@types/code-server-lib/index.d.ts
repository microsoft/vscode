/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import type * as net from 'net';
import type { InternalNLSConfiguration, NLSConfiguration } from '../../../base/node/languagePacks';

declare global {
	namespace CodeServerLib {
		export enum AuthType {
			Password = 'password',
			None = 'none',
		}

		export interface ServerParsedArgs {
			//#region
			auth?: AuthType;
			//#endregion

			port?: string;
			'pick-port'?: string;
			/**
			 * @deprecated use `connection-token` instead
			 */
			connectionToken?: string;
			/**
			 * A secret token that must be provided by the web client with all requests.
			 * Use only `[0-9A-Za-z\-]`.
			 *
			 * By default, a UUID will be generated every time the server starts up.
			 *
			 * If the server is running on a multi-user system, then consider
			 * using `--connection-secret` which has the advantage that the token cannot
			 * be seen by other users using `ps` or similar commands.
			 */
			'connection-token'?: string;
			/**
			 * A path to a filename which will be read on startup.
			 * Consider placing this file in a folder readable only by the same user (a `chmod 0700` directory).
			 *
			 * The contents of the file will be used as the connectionToken. Use only `[0-9A-Z\-]` as contents in the file.
			 * The file can optionally end in a `\n` which will be ignored.
			 *
			 * This secret must be communicated to any vscode instance via the resolver or embedder API.
			 */
			'connection-secret'?: string;
			host?: string;
			'socket-path'?: string;
			driver?: string;
			'print-startup-performance'?: boolean;
			'print-ip-address'?: boolean;
			'disable-websocket-compression'?: boolean;
			'disable-telemetry'?: boolean;
			fileWatcherPolling?: string;
			'start-server'?: boolean;

			'enable-remote-auto-shutdown'?: boolean;
			'remote-auto-shutdown-without-delay'?: boolean;

			'extensions-dir'?: string;
			'extensions-download-dir'?: string;
			'install-extension'?: string[];
			'install-builtin-extension'?: string[];
			'uninstall-extension'?: string[];
			'list-extensions'?: boolean;
			'locate-extension'?: string[];
			'show-versions'?: boolean;
			'category'?: string;

			'force-disable-user-env'?: boolean;
			'use-host-proxy'?: string;

			'without-browser-env-var'?: boolean;

			force?: boolean; // used by install-extension
			'do-not-sync'?: boolean; // used by install-extension

			'user-data-dir'?: string;
			'builtin-extensions-dir'?: string;

			// web
			workspace: string;
			folder: string;
			'web-user-data-dir'?: string;
			'enable-sync'?: boolean;
			'github-auth'?: string;
			'log'?: string;
			'logsPath'?: string;

			// server cli
			help: boolean;
			version: boolean;

			'accept-server-license-terms': boolean;

			_: string[];
		}

		export interface StartPath {
			url: string;
			workspace: boolean;
		}

		export interface ServerConfiguration {
			args: ServerParsedArgs;
			authed: boolean;
			disableUpdateCheck: boolean;
			startPath?: StartPath;
			codeServerVersion?: string;
			serverUrl: URL;
		}

		export type CreateServer = (
			address: string | net.AddressInfo | null,
			args: ServerParsedArgs
		) => Promise<IServerAPI>;

		export interface ProductDescription {
			productName: string;
			version: string;
			commit: string;
			executableName: string;
		}

		export type RemoteCLIMain = (desc: ProductDescription, args: string[]) => void;

		export interface IServerAPI {
			handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
			handleUpgrade(req: http.IncomingMessage, socket: net.Socket): void;
			handleServerError(err: Error): void;
			dispose(): void;
		}

		/**
		 * @deprecated This should be removed when code-server merges with lib/vscode
		 */
		export type SpawnCli = (args: ServerParsedArgs) => Promise<void>;

		/**
		 * @deprecated This should be removed when code-server merges with lib/vscode
		 */
		export interface CliMessage {
			type: 'cli';
			args: ServerParsedArgs;
		}

		/**
		 * @deprecated This should be removed when code-server merges with lib/vscode
		 */
		export interface OpenCommandPipeArgs {
			type: 'open';
			fileURIs?: string[];
			folderURIs: string[];
			forceNewWindow?: boolean;
			diffMode?: boolean;
			addMode?: boolean;
			gotoLineMode?: boolean;
			forceReuseWindow?: boolean;
			waitMarkerFilePath?: string;
		}

		export type NLSConfigurationWeb =
			| NLSConfiguration
			| InternalNLSConfiguration;

		export { NLSConfiguration, InternalNLSConfiguration };
	}
}

export { };
