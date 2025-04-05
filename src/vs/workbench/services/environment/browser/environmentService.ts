/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ExtensionKind, IEnvironmentService, IExtensionHostDebugParams } from '../../../../platform/environment/common/environment.js';
import { IPath } from '../../../../platform/window/common/window.js';
import { IWorkbenchEnvironmentService } from '../common/environmentService.js';
import { IWorkbenchConstructionOptions } from '../../../browser/web.api.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { memoize } from '../../../../base/common/decorators.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { parseLineAndColumnAware } from '../../../../base/common/extpath.js';
import { LogLevelToString } from '../../../../platform/log/common/log.js';
import { isUndefined } from '../../../../base/common/types.js';
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { EXTENSION_IDENTIFIER_WITH_LOG_REGEX } from '../../../../platform/environment/common/environmentService.js';

export const IBrowserWorkbenchEnvironmentService = refineServiceDecorator<IEnvironmentService, IBrowserWorkbenchEnvironmentService>(IEnvironmentService);

/**
 * A subclass of the `IWorkbenchEnvironmentService` to be used only environments
 * where the web API is available (browsers, Electron).
 */
export interface IBrowserWorkbenchEnvironmentService extends IWorkbenchEnvironmentService {

	/**
	 * Options used to configure the workbench.
	 */
	readonly options?: IWorkbenchConstructionOptions;

	/**
	 * Gets whether a resolver extension is expected for the environment.
	 */
	readonly expectsResolverExtension: boolean;
}

export class BrowserWorkbenchEnvironmentService implements IBrowserWorkbenchEnvironmentService {

	declare readonly _serviceBrand: undefined;

	@memoize
	get remoteAuthority(): string | undefined { return this.options.remoteAuthority; }

	@memoize
	get expectsResolverExtension(): boolean {
		return !!this.options.remoteAuthority?.includes('+') && !this.options.webSocketFactory;
	}

	@memoize
	get isBuilt(): boolean { return !!this.productService.commit; }

	@memoize
	get logLevel(): string | undefined {
		const logLevelFromPayload = this.payload?.get('logLevel');
		if (logLevelFromPayload) {
			return logLevelFromPayload.split(',').find(entry => !EXTENSION_IDENTIFIER_WITH_LOG_REGEX.test(entry));
		}

		return this.options.developmentOptions?.logLevel !== undefined ? LogLevelToString(this.options.developmentOptions?.logLevel) : undefined;
	}

	get extensionLogLevel(): [string, string][] | undefined {
		const logLevelFromPayload = this.payload?.get('logLevel');
		if (logLevelFromPayload) {
			const result: [string, string][] = [];
			for (const entry of logLevelFromPayload.split(',')) {
				const matches = EXTENSION_IDENTIFIER_WITH_LOG_REGEX.exec(entry);
				if (matches && matches[1] && matches[2]) {
					result.push([matches[1], matches[2]]);
				}
			}

			return result.length ? result : undefined;
		}

		return this.options.developmentOptions?.extensionLogLevel !== undefined ? this.options.developmentOptions?.extensionLogLevel.map(([extension, logLevel]) => ([extension, LogLevelToString(logLevel)])) : undefined;
	}

	get profDurationMarkers(): string[] | undefined {
		const profDurationMarkersFromPayload = this.payload?.get('profDurationMarkers');
		if (profDurationMarkersFromPayload) {
			const result: string[] = [];
			for (const entry of profDurationMarkersFromPayload.split(',')) {
				result.push(entry);
			}

			return result.length === 2 ? result : undefined;
		}

		return undefined;
	}

	@memoize
	get windowLogsPath(): URI { return this.logsHome; }

	@memoize
	get logFile(): URI { return joinPath(this.windowLogsPath, 'window.log'); }

	@memoize
	get userRoamingDataHome(): URI { return URI.file('/User').with({ scheme: Schemas.vscodeUserData }); }

	@memoize
	get argvResource(): URI { return joinPath(this.userRoamingDataHome, 'argv.json'); }

	@memoize
	get cacheHome(): URI { return joinPath(this.userRoamingDataHome, 'caches'); }

	@memoize
	get workspaceStorageHome(): URI { return joinPath(this.userRoamingDataHome, 'workspaceStorage'); }

	@memoize
	get localHistoryHome(): URI { return joinPath(this.userRoamingDataHome, 'History'); }

	@memoize
	get stateResource(): URI { return joinPath(this.userRoamingDataHome, 'State', 'storage.json'); }

	/**
	 * In Web every workspace can potentially have scoped user-data
	 * and/or extensions and if Sync state is shared then it can make
	 * Sync error prone - say removing extensions from another workspace.
	 * Hence scope Sync state per workspace. Sync scoped to a workspace
	 * is capable of handling opening same workspace in multiple windows.
	 */
	@memoize
	get userDataSyncHome(): URI { return joinPath(this.userRoamingDataHome, 'sync', this.workspaceId); }

	@memoize
	get sync(): 'on' | 'off' | undefined { return undefined; }

	@memoize
	get keyboardLayoutResource(): URI { return joinPath(this.userRoamingDataHome, 'keyboardLayout.json'); }

	@memoize
	get untitledWorkspacesHome(): URI { return joinPath(this.userRoamingDataHome, 'Workspaces'); }

	@memoize
	get serviceMachineIdResource(): URI { return joinPath(this.userRoamingDataHome, 'machineid'); }

	@memoize
	get extHostLogsPath(): URI { return joinPath(this.logsHome, 'exthost'); }

	private extensionHostDebugEnvironment: IExtensionHostDebugEnvironment | undefined = undefined;

	@memoize
	get debugExtensionHost(): IExtensionHostDebugParams {
		if (!this.extensionHostDebugEnvironment) {
			this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this.extensionHostDebugEnvironment.params;
	}

	@memoize
	get isExtensionDevelopment(): boolean {
		if (!this.extensionHostDebugEnvironment) {
			this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this.extensionHostDebugEnvironment.isExtensionDevelopment;
	}

	@memoize
	get extensionDevelopmentLocationURI(): URI[] | undefined {
		if (!this.extensionHostDebugEnvironment) {
			this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this.extensionHostDebugEnvironment.extensionDevelopmentLocationURI;
	}

	@memoize
	get extensionDevelopmentLocationKind(): ExtensionKind[] | undefined {
		if (!this.extensionHostDebugEnvironment) {
			this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this.extensionHostDebugEnvironment.extensionDevelopmentKind;
	}

	@memoize
	get extensionTestsLocationURI(): URI | undefined {
		if (!this.extensionHostDebugEnvironment) {
			this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this.extensionHostDebugEnvironment.extensionTestsLocationURI;
	}

	@memoize
	get extensionEnabledProposedApi(): string[] | undefined {
		if (!this.extensionHostDebugEnvironment) {
			this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this.extensionHostDebugEnvironment.extensionEnabledProposedApi;
	}

	@memoize
	get debugRenderer(): boolean {
		if (!this.extensionHostDebugEnvironment) {
			this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this.extensionHostDebugEnvironment.debugRenderer;
	}

	@memoize
	get enableSmokeTestDriver() { return this.options.developmentOptions?.enableSmokeTestDriver; }

	@memoize
	get disableExtensions() { return this.payload?.get('disableExtensions') === 'true'; }

	@memoize
	get enableExtensions() { return this.options.enabledExtensions; }

	@memoize
	get webviewExternalEndpoint(): string {
		const endpoint = this.options.webviewEndpoint
			|| this.productService.webviewContentExternalBaseUrlTemplate
			|| 'https://{{uuid}}.vscode-cdn.net/{{quality}}/{{commit}}/out/vs/workbench/contrib/webview/browser/pre/';

		const webviewExternalEndpointCommit = this.payload?.get('webviewExternalEndpointCommit');
		return endpoint
			.replace('{{commit}}', webviewExternalEndpointCommit ?? this.productService.commit ?? 'ef65ac1ba57f57f2a3961bfe94aa20481caca4c6')
			.replace('{{quality}}', (webviewExternalEndpointCommit ? 'insider' : this.productService.quality) ?? 'insider');
	}

	@memoize
	get extensionTelemetryLogResource(): URI { return joinPath(this.logsHome, 'extensionTelemetry.log'); }

	@memoize
	get disableTelemetry(): boolean { return false; }

	@memoize
	get verbose(): boolean { return this.payload?.get('verbose') === 'true'; }

	@memoize
	get logExtensionHostCommunication(): boolean { return this.payload?.get('logExtensionHostCommunication') === 'true'; }

	@memoize
	get skipReleaseNotes(): boolean { return this.payload?.get('skipReleaseNotes') === 'true'; }

	@memoize
	get skipWelcome(): boolean { return this.payload?.get('skipWelcome') === 'true'; }

	@memoize
	get disableWorkspaceTrust(): boolean { return !this.options.enableWorkspaceTrust; }

	@memoize
	get profile(): string | undefined { return this.payload?.get('profile'); }

	@memoize
	get editSessionId(): string | undefined { return this.options.editSessionId; }

	private payload: Map<string, string> | undefined;

	constructor(
		private readonly workspaceId: string,
		readonly logsHome: URI,
		readonly options: IWorkbenchConstructionOptions,
		private readonly productService: IProductService
	) {
		if (options.workspaceProvider && Array.isArray(options.workspaceProvider.payload)) {
			try {
				this.payload = new Map(options.workspaceProvider.payload);
			} catch (error) {
				onUnexpectedError(error); // possible invalid payload for map
			}
		}
	}

	private resolveExtensionHostDebugEnvironment(): IExtensionHostDebugEnvironment {
		const extensionHostDebugEnvironment: IExtensionHostDebugEnvironment = {
			params: {
				port: null,
				break: false
			},
			debugRenderer: false,
			isExtensionDevelopment: false,
			extensionDevelopmentLocationURI: undefined,
			extensionDevelopmentKind: undefined
		};

		// Fill in selected extra environmental properties
		if (this.payload) {
			for (const [key, value] of this.payload) {
				switch (key) {
					case 'extensionDevelopmentPath':
						if (!extensionHostDebugEnvironment.extensionDevelopmentLocationURI) {
							extensionHostDebugEnvironment.extensionDevelopmentLocationURI = [];
						}
						extensionHostDebugEnvironment.extensionDevelopmentLocationURI.push(URI.parse(value));
						extensionHostDebugEnvironment.isExtensionDevelopment = true;
						break;
					case 'extensionDevelopmentKind':
						extensionHostDebugEnvironment.extensionDevelopmentKind = [<ExtensionKind>value];
						break;
					case 'extensionTestsPath':
						extensionHostDebugEnvironment.extensionTestsLocationURI = URI.parse(value);
						break;
					case 'debugRenderer':
						extensionHostDebugEnvironment.debugRenderer = value === 'true';
						break;
					case 'debugId':
						extensionHostDebugEnvironment.params.debugId = value;
						break;
					case 'inspect-brk-extensions':
						extensionHostDebugEnvironment.params.port = parseInt(value);
						extensionHostDebugEnvironment.params.break = true;
						break;
					case 'inspect-extensions':
						extensionHostDebugEnvironment.params.port = parseInt(value);
						break;
					case 'enableProposedApi':
						extensionHostDebugEnvironment.extensionEnabledProposedApi = [];
						break;
				}
			}
		}

		const developmentOptions = this.options.developmentOptions;
		if (developmentOptions && !extensionHostDebugEnvironment.isExtensionDevelopment) {
			if (developmentOptions.extensions?.length) {
				extensionHostDebugEnvironment.extensionDevelopmentLocationURI = developmentOptions.extensions.map(e => URI.revive(e));
				extensionHostDebugEnvironment.isExtensionDevelopment = true;
			}

			if (developmentOptions.extensionTestsPath) {
				extensionHostDebugEnvironment.extensionTestsLocationURI = URI.revive(developmentOptions.extensionTestsPath);
			}
		}

		return extensionHostDebugEnvironment;
	}

	@memoize
	get filesToOpenOrCreate(): IPath<ITextEditorOptions>[] | undefined {
		if (this.payload) {
			const fileToOpen = this.payload.get('openFile');
			if (fileToOpen) {
				const fileUri = URI.parse(fileToOpen);

				// Support: --goto parameter to open on line/col
				if (this.payload.has('gotoLineMode')) {
					const pathColumnAware = parseLineAndColumnAware(fileUri.path);

					return [{
						fileUri: fileUri.with({ path: pathColumnAware.path }),
						options: {
							selection: !isUndefined(pathColumnAware.line) ? { startLineNumber: pathColumnAware.line, startColumn: pathColumnAware.column || 1 } : undefined
						}
					}];
				}

				return [{ fileUri }];
			}
		}

		return undefined;
	}

	@memoize
	get filesToDiff(): IPath[] | undefined {
		if (this.payload) {
			const fileToDiffPrimary = this.payload.get('diffFilePrimary');
			const fileToDiffSecondary = this.payload.get('diffFileSecondary');
			if (fileToDiffPrimary && fileToDiffSecondary) {
				return [
					{ fileUri: URI.parse(fileToDiffSecondary) },
					{ fileUri: URI.parse(fileToDiffPrimary) }
				];
			}
		}

		return undefined;
	}

	@memoize
	get filesToMerge(): IPath[] | undefined {
		if (this.payload) {
			const fileToMerge1 = this.payload.get('mergeFile1');
			const fileToMerge2 = this.payload.get('mergeFile2');
			const fileToMergeBase = this.payload.get('mergeFileBase');
			const fileToMergeResult = this.payload.get('mergeFileResult');
			if (fileToMerge1 && fileToMerge2 && fileToMergeBase && fileToMergeResult) {
				return [
					{ fileUri: URI.parse(fileToMerge1) },
					{ fileUri: URI.parse(fileToMerge2) },
					{ fileUri: URI.parse(fileToMergeBase) },
					{ fileUri: URI.parse(fileToMergeResult) }
				];
			}
		}

		return undefined;
	}
}

interface IExtensionHostDebugEnvironment {
	params: IExtensionHostDebugParams;
	debugRenderer: boolean;
	isExtensionDevelopment: boolean;
	extensionDevelopmentLocationURI?: URI[];
	extensionDevelopmentKind?: ExtensionKind[];
	extensionTestsLocationURI?: URI;
	extensionEnabledProposedApi?: string[];
}
