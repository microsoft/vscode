/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toLocalISOString } from 'vs/base/common/date';
import { memoize } from 'vs/base/common/decorators';
import { FileAccess } from 'vs/base/common/network';
import { dirname, join, normalize, resolve } from 'vs/base/common/path';
import { env } from 'vs/base/common/process';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { ExtensionKind, IDebugParams, IExtensionHostDebugParams, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IProductService } from 'vs/platform/product/common/productService';

export const EXTENSION_IDENTIFIER_WITH_LOG_REGEX = /^([^.]+\..+):(.+)$/;

export interface INativeEnvironmentPaths {

	/**
	 * The user data directory to use for anything that should be
	 * persisted except for the content that is meant for the `homeDir`.
	 *
	 * Only one instance of VSCode can use the same `userDataDir`.
	 */
	userDataDir: string;

	/**
	 * The user home directory mainly used for persisting extensions
	 * and global configuration that should be shared across all
	 * versions.
	 */
	homeDir: string;

	/**
	 * OS tmp dir.
	 */
	tmpDir: string;
}

export abstract class AbstractNativeEnvironmentService implements INativeEnvironmentService {

	declare readonly _serviceBrand: undefined;

	@memoize
	get appRoot(): string { return dirname(FileAccess.asFileUri('', require).fsPath); }

	@memoize
	get userHome(): URI { return URI.file(this.paths.homeDir); }

	@memoize
	get userDataPath(): string { return this.paths.userDataDir; }

	@memoize
	get appSettingsHome(): URI { return URI.file(join(this.userDataPath, 'User')); }

	@memoize
	get tmpDir(): URI { return URI.file(this.paths.tmpDir); }

	@memoize
	get cacheHome(): URI { return URI.file(this.userDataPath); }

	@memoize
	get stateResource(): URI { return joinPath(this.appSettingsHome, 'globalStorage', 'storage.json'); }

	@memoize
	get userRoamingDataHome(): URI { return this.appSettingsHome; }

	@memoize
	get userDataSyncHome(): URI { return joinPath(this.userRoamingDataHome, 'sync'); }

	get logsPath(): string {
		if (!this.args.logsPath) {
			const key = toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '');
			this.args.logsPath = join(this.userDataPath, 'logs', key);
		}

		return this.args.logsPath;
	}

	@memoize
	get userDataSyncLogResource(): URI { return URI.file(join(this.logsPath, 'userDataSync.log')); }

	@memoize
	get editSessionsLogResource(): URI { return URI.file(join(this.logsPath, 'editSessions.log')); }

	@memoize
	get remoteTunnelLogResource(): URI { return URI.file(join(this.logsPath, 'remoteTunnel.log')); }

	@memoize
	get sync(): 'on' | 'off' | undefined { return this.args.sync; }

	@memoize
	get machineSettingsResource(): URI { return joinPath(URI.file(join(this.userDataPath, 'Machine')), 'settings.json'); }

	@memoize
	get workspaceStorageHome(): URI { return joinPath(this.appSettingsHome, 'workspaceStorage'); }

	@memoize
	get localHistoryHome(): URI { return joinPath(this.appSettingsHome, 'History'); }

	@memoize
	get keyboardLayoutResource(): URI { return joinPath(this.userRoamingDataHome, 'keyboardLayout.json'); }

	@memoize
	get argvResource(): URI {
		const vscodePortable = env['VSCODE_PORTABLE'];
		if (vscodePortable) {
			return URI.file(join(vscodePortable, 'argv.json'));
		}

		return joinPath(this.userHome, this.productService.dataFolderName, 'argv.json');
	}

	@memoize
	get isExtensionDevelopment(): boolean { return !!this.args.extensionDevelopmentPath; }

	@memoize
	get untitledWorkspacesHome(): URI { return URI.file(join(this.userDataPath, 'Workspaces')); }

	@memoize
	get installSourcePath(): string { return join(this.userDataPath, 'installSource'); }

	@memoize
	get builtinExtensionsPath(): string {
		const cliBuiltinExtensionsDir = this.args['builtin-extensions-dir'];
		if (cliBuiltinExtensionsDir) {
			return resolve(cliBuiltinExtensionsDir);
		}

		return normalize(join(FileAccess.asFileUri('', require).fsPath, '..', 'extensions'));
	}

	get extensionsDownloadLocation(): URI {
		const cliExtensionsDownloadDir = this.args['extensions-download-dir'];
		if (cliExtensionsDownloadDir) {
			return URI.file(resolve(cliExtensionsDownloadDir));
		}

		return URI.file(join(this.userDataPath, 'CachedExtensionVSIXs'));
	}

	@memoize
	get extensionsPath(): string {
		const cliExtensionsDir = this.args['extensions-dir'];
		if (cliExtensionsDir) {
			return resolve(cliExtensionsDir);
		}

		const vscodeExtensions = env['VSCODE_EXTENSIONS'];
		if (vscodeExtensions) {
			return vscodeExtensions;
		}

		const vscodePortable = env['VSCODE_PORTABLE'];
		if (vscodePortable) {
			return join(vscodePortable, 'extensions');
		}

		return joinPath(this.userHome, this.productService.dataFolderName, 'extensions').fsPath;
	}

	@memoize
	get extensionDevelopmentLocationURI(): URI[] | undefined {
		const extensionDevelopmentPaths = this.args.extensionDevelopmentPath;
		if (Array.isArray(extensionDevelopmentPaths)) {
			return extensionDevelopmentPaths.map(extensionDevelopmentPath => {
				if (/^[^:/?#]+?:\/\//.test(extensionDevelopmentPath)) {
					return URI.parse(extensionDevelopmentPath);
				}

				return URI.file(normalize(extensionDevelopmentPath));
			});
		}

		return undefined;
	}

	@memoize
	get extensionDevelopmentKind(): ExtensionKind[] | undefined {
		return this.args.extensionDevelopmentKind?.map(kind => kind === 'ui' || kind === 'workspace' || kind === 'web' ? kind : 'workspace');
	}

	@memoize
	get extensionTestsLocationURI(): URI | undefined {
		const extensionTestsPath = this.args.extensionTestsPath;
		if (extensionTestsPath) {
			if (/^[^:/?#]+?:\/\//.test(extensionTestsPath)) {
				return URI.parse(extensionTestsPath);
			}

			return URI.file(normalize(extensionTestsPath));
		}

		return undefined;
	}

	get disableExtensions(): boolean | string[] {
		if (this.args['disable-extensions']) {
			return true;
		}

		const disableExtensions = this.args['disable-extension'];
		if (disableExtensions) {
			if (typeof disableExtensions === 'string') {
				return [disableExtensions];
			}

			if (Array.isArray(disableExtensions) && disableExtensions.length > 0) {
				return disableExtensions;
			}
		}

		return false;
	}

	@memoize
	get debugExtensionHost(): IExtensionHostDebugParams { return parseExtensionHostPort(this.args, this.isBuilt); }
	get debugRenderer(): boolean { return !!this.args.debugRenderer; }

	get isBuilt(): boolean { return !env['VSCODE_DEV']; }
	get verbose(): boolean { return !!this.args.verbose; }

	@memoize
	get logLevel(): string | undefined { return this.args.log?.find(entry => !EXTENSION_IDENTIFIER_WITH_LOG_REGEX.test(entry)); }
	@memoize
	get extensionLogLevel(): [string, string][] | undefined {
		const result: [string, string][] = [];
		for (const entry of this.args.log || []) {
			const matches = EXTENSION_IDENTIFIER_WITH_LOG_REGEX.exec(entry);
			if (matches && matches[1] && matches[2]) {
				result.push([matches[1], matches[2]]);
			}
		}
		return result.length ? result : undefined;
	}

	@memoize
	get serviceMachineIdResource(): URI { return joinPath(URI.file(this.userDataPath), 'machineid'); }

	get crashReporterId(): string | undefined { return this.args['crash-reporter-id']; }
	get crashReporterDirectory(): string | undefined { return this.args['crash-reporter-directory']; }

	@memoize
	get telemetryLogResource(): URI { return URI.file(join(this.logsPath, 'telemetry.log')); }
	get disableTelemetry(): boolean { return !!this.args['disable-telemetry']; }

	@memoize
	get disableWorkspaceTrust(): boolean { return !!this.args['disable-workspace-trust']; }

	@memoize
	get policyFile(): URI | undefined {
		if (this.args['__enable-file-policy']) {
			const vscodePortable = env['VSCODE_PORTABLE'];
			if (vscodePortable) {
				return URI.file(join(vscodePortable, 'policy.json'));
			}

			return joinPath(this.userHome, this.productService.dataFolderName, 'policy.json');
		}
		return undefined;
	}

	editSessionId: string | undefined = this.args['editSessionId'];

	get continueOn(): string | undefined {
		return this.args['continueOn'];
	}

	set continueOn(value: string | undefined) {
		this.args['continueOn'] = value;
	}

	get args(): NativeParsedArgs { return this._args; }

	constructor(
		private readonly _args: NativeParsedArgs,
		private readonly paths: INativeEnvironmentPaths,
		protected readonly productService: IProductService
	) { }
}

export function parseExtensionHostPort(args: NativeParsedArgs, isBuild: boolean): IExtensionHostDebugParams {
	return parseDebugParams(args['inspect-extensions'], args['inspect-brk-extensions'], 5870, isBuild, args.debugId, args.extensionEnvironment);
}

export function parseSearchPort(args: NativeParsedArgs, isBuild: boolean): IDebugParams {
	return parseDebugParams(args['inspect-search'], args['inspect-brk-search'], 5876, isBuild, args.extensionEnvironment);
}

export function parsePtyHostPort(args: NativeParsedArgs, isBuild: boolean): IDebugParams {
	return parseDebugParams(args['inspect-ptyhost'], args['inspect-brk-ptyhost'], 5877, isBuild, args.extensionEnvironment);
}

function parseDebugParams(debugArg: string | undefined, debugBrkArg: string | undefined, defaultBuildPort: number, isBuild: boolean, debugId?: string, environmentString?: string): IExtensionHostDebugParams {
	const portStr = debugBrkArg || debugArg;
	const port = Number(portStr) || (!isBuild ? defaultBuildPort : null);
	const brk = port ? Boolean(!!debugBrkArg) : false;
	let env: Record<string, string> | undefined;
	if (environmentString) {
		try {
			env = JSON.parse(environmentString);
		} catch {
			// ignore
		}
	}

	return { port, break: brk, debugId, env };
}
