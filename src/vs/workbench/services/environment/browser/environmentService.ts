/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { ExportData } from 'vs/base/common/performance';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { BACKUPS, IExtensionHostDebugParams } from 'vs/platform/environment/common/environment';
import { LogLevel } from 'vs/platform/log/common/log';
import { IPath, IPathsToWaitFor, IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkbenchConstructionOptions } from 'vs/workbench/workbench.web.api';
import product from 'vs/platform/product/common/product';
import { serializableToMap } from 'vs/base/common/map';
import { memoize } from 'vs/base/common/decorators';

// TODO@ben remove properties that are node/electron only
export class BrowserWindowConfiguration implements IWindowConfiguration {

	constructor(
		private readonly options: IBrowserWorkbenchEnvironmentConstructionOptions,
		private readonly payload: Map<string, string> | undefined,
		private readonly environment: IWorkbenchEnvironmentService
	) { }

	//#region PROPERLY CONFIGURED IN DESKTOP + WEB

	@memoize
	get sessionId(): string { return generateUuid(); }

	@memoize
	get remoteAuthority(): string | undefined { return this.options.remoteAuthority; }

	@memoize
	get connectionToken(): string | undefined { return this.options.connectionToken || this.getCookieValue('vscode-tkn'); }

	@memoize
	get backupWorkspaceResource(): URI { return joinPath(this.environment.backupHome, this.options.workspaceId); }

	@memoize
	get filesToOpenOrCreate(): IPath[] | undefined {
		if (this.payload) {
			const fileToOpen = this.payload.get('openFile');
			if (fileToOpen) {
				return [{ fileUri: URI.parse(fileToOpen) }];
			}
		}

		return undefined;
	}

	// Currently unsupported in web
	get filesToDiff(): IPath[] | undefined { return undefined; }

	//#endregion


	//#region TODO MOVE TO NODE LAYER

	_!: any[];

	windowId!: number;
	mainPid!: number;

	logLevel!: LogLevel;

	appRoot!: string;
	execPath!: string;
	backupPath?: string;
	nodeCachedDataDir?: string;

	userEnv!: IProcessEnvironment;

	workspace?: IWorkspaceIdentifier;
	folderUri?: ISingleFolderWorkspaceIdentifier;

	zoomLevel?: number;
	fullscreen?: boolean;
	maximized?: boolean;
	highContrast?: boolean;
	accessibilitySupport?: boolean;
	partsSplashPath?: string;

	isInitialStartup?: boolean;
	perfEntries!: ExportData;

	filesToWait?: IPathsToWaitFor;

	//#endregion

	private getCookieValue(name: string): string | undefined {
		const m = document.cookie.match('(^|[^;]+)\\s*' + name + '\\s*=\\s*([^;]+)'); // See https://stackoverflow.com/a/25490531

		return m ? m.pop() : undefined;
	}
}

interface IBrowserWorkbenchEnvironmentConstructionOptions extends IWorkbenchConstructionOptions {
	workspaceId: string;
	logsPath: URI;
}

interface IExtensionHostDebugEnvironment {
	params: IExtensionHostDebugParams;
	isExtensionDevelopment: boolean;
	extensionDevelopmentLocationURI: URI[];
	extensionTestsLocationURI?: URI;
}

export class BrowserWorkbenchEnvironmentService implements IWorkbenchEnvironmentService {

	_serviceBrand: undefined;

	//#region PROPERLY CONFIGURED IN DESKTOP + WEB

	@memoize
	get isBuilt(): boolean { return !!product.commit; }

	@memoize
	get logsPath(): string { return this.options.logsPath.path; }

	@memoize
	get logFile(): URI { return joinPath(this.options.logsPath, 'window.log'); }

	@memoize
	get userRoamingDataHome(): URI { return URI.file('/User').with({ scheme: Schemas.userData }); }

	@memoize
	get settingsResource(): URI { return joinPath(this.userRoamingDataHome, 'settings.json'); }

	@memoize
	get settingsSyncPreviewResource(): URI { return joinPath(this.userRoamingDataHome, '.settings.json'); }

	@memoize
	get userDataSyncLogResource(): URI { return joinPath(this.options.logsPath, 'userDataSync.log'); }

	@memoize
	get keybindingsResource(): URI { return joinPath(this.userRoamingDataHome, 'keybindings.json'); }

	@memoize
	get keyboardLayoutResource(): URI { return joinPath(this.userRoamingDataHome, 'keyboardLayout.json'); }

	@memoize
	get backupHome(): URI { return joinPath(this.userRoamingDataHome, BACKUPS); }

	@memoize
	get untitledWorkspacesHome(): URI { return joinPath(this.userRoamingDataHome, 'Workspaces'); }

	private _extensionHostDebugEnvironment: IExtensionHostDebugEnvironment | undefined = undefined;
	get debugExtensionHost(): IExtensionHostDebugParams {
		if (!this._extensionHostDebugEnvironment) {
			this._extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this._extensionHostDebugEnvironment.params;
	}

	get isExtensionDevelopment(): boolean {
		if (!this._extensionHostDebugEnvironment) {
			this._extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this._extensionHostDebugEnvironment.isExtensionDevelopment;
	}

	get extensionDevelopmentLocationURI(): URI[] {
		if (!this._extensionHostDebugEnvironment) {
			this._extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this._extensionHostDebugEnvironment.extensionDevelopmentLocationURI;
	}

	get extensionTestsLocationURI(): URI | undefined {
		if (!this._extensionHostDebugEnvironment) {
			this._extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this._extensionHostDebugEnvironment.extensionTestsLocationURI;
	}

	@memoize
	get webviewExternalEndpoint(): string {
		// TODO: get fallback from product.json
		return (this.options.webviewEndpoint || 'https://{{uuid}}.vscode-webview-test.com/{{commit}}').replace('{{commit}}', product.commit || '0d728c31ebdf03869d2687d9be0b017667c9ff37');
	}

	@memoize
	get webviewResourceRoot(): string {
		return `${this.webviewExternalEndpoint}/vscode-resource/{{resource}}`;
	}

	@memoize
	get webviewCspSource(): string {
		return this.webviewExternalEndpoint.replace('{{uuid}}', '*');
	}

	// Currently not configurable in web
	get disableExtensions() { return false; }
	get extensionsPath(): string | undefined { return undefined; }
	get verbose(): boolean { return false; }
	get disableUpdates(): boolean { return false; }
	get logExtensionHostCommunication(): boolean { return false; }

	//#endregion


	//#region TODO MOVE TO NODE LAYER

	private _configuration: IWindowConfiguration | undefined = undefined;
	get configuration(): IWindowConfiguration {
		if (!this._configuration) {
			this._configuration = new BrowserWindowConfiguration(this.options, this.payload, this);
		}

		return this._configuration;
	}

	args = { _: [] };

	wait!: boolean;
	status!: boolean;
	log?: string;

	mainIPCHandle!: string;
	sharedIPCHandle!: string;

	nodeCachedDataDir?: string;

	argvResource!: URI;

	disableCrashReporter!: boolean;

	driverHandle?: string;
	driverVerbose!: boolean;

	installSourcePath!: string;

	builtinExtensionsPath!: string;

	globalStorageHome!: string;
	workspaceStorageHome!: string;

	backupWorkspacesPath!: string;

	machineSettingsHome!: URI;
	machineSettingsResource!: URI;

	userHome!: string;
	userDataPath!: string;
	appRoot!: string;
	appSettingsHome!: URI;
	execPath!: string;
	cliPath!: string;

	//#endregion


	//#region TODO ENABLE IN WEB

	galleryMachineIdResource?: URI;

	//#endregion

	private payload: Map<string, string> | undefined;

	constructor(readonly options: IBrowserWorkbenchEnvironmentConstructionOptions) {
		if (options.workspaceProvider && Array.isArray(options.workspaceProvider.payload)) {
			this.payload = serializableToMap(options.workspaceProvider.payload);
		}
	}

	private resolveExtensionHostDebugEnvironment(): IExtensionHostDebugEnvironment {
		const extensionHostDebugEnvironment: IExtensionHostDebugEnvironment = {
			params: {
				port: null,
				break: false
			},
			isExtensionDevelopment: false,
			extensionDevelopmentLocationURI: []
		};

		// Fill in selected extra environmental properties
		if (this.payload) {
			for (const [key, value] of this.payload) {
				switch (key) {
					case 'extensionDevelopmentPath':
						extensionHostDebugEnvironment.extensionDevelopmentLocationURI = [URI.parse(value)];
						extensionHostDebugEnvironment.isExtensionDevelopment = true;
						break;
					case 'extensionTestsPath':
						extensionHostDebugEnvironment.extensionTestsLocationURI = URI.parse(value);
						break;
					case 'debugId':
						extensionHostDebugEnvironment.params.debugId = value;
						break;
					case 'inspect-brk-extensions':
						extensionHostDebugEnvironment.params.port = parseInt(value);
						extensionHostDebugEnvironment.params.break = true;
						break;
				}
			}
		} else {
			// TODO@Ben remove me once environment is adopted
			if (document && document.location && document.location.search) {
				const map = new Map<string, string>();
				const query = document.location.search.substring(1);
				const vars = query.split('&');
				for (let p of vars) {
					const pair = p.split('=');
					if (pair.length >= 2) {
						map.set(pair[0], decodeURIComponent(pair[1]));
					}
				}

				const edp = map.get('extensionDevelopmentPath');
				if (edp) {
					extensionHostDebugEnvironment.extensionDevelopmentLocationURI = [URI.parse(edp)];
					extensionHostDebugEnvironment.isExtensionDevelopment = true;
				}

				const di = map.get('debugId');
				if (di) {
					extensionHostDebugEnvironment.params.debugId = di;
				}

				const ibe = map.get('inspect-brk-extensions');
				if (ibe) {
					extensionHostDebugEnvironment.params.port = parseInt(ibe);
					extensionHostDebugEnvironment.params.break = false;
				}
			}
		}

		return extensionHostDebugEnvironment;
	}
}
