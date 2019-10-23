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
import { BACKUPS, IDebugParams, IExtensionHostDebugParams } from 'vs/platform/environment/common/environment';
import { LogLevel } from 'vs/platform/log/common/log';
import { IPath, IPathsToWaitFor, IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkbenchConstructionOptions } from 'vs/workbench/workbench.web.api';
import product from 'vs/platform/product/common/product';
import { serializableToMap } from 'vs/base/common/map';
import { memoize } from 'vs/base/common/decorators';

export class BrowserWindowConfiguration implements IWindowConfiguration {

	constructor(private readonly options: IBrowserWorkbenchEnvironemntConstructionOptions, private readonly environment: IWorkbenchEnvironmentService) { }

	//#region PROPERLY CONFIGURED

	@memoize
	get sessionId(): string { return generateUuid(); }

	@memoize
	get remoteAuthority(): string | undefined { return this.options.remoteAuthority; }

	@memoize
	get connectionToken(): string | undefined { return this.options.connectionToken || this.getCookieValue('vscode-tkn'); }

	@memoize
	get backupWorkspaceResource(): URI { return joinPath(this.environment.backupHome, this.options.workspaceId); }

	//#endregion


	//#region TODO@ben TO BE DONE

	_!: any[];

	readonly machineId = generateUuid();
	windowId!: number;
	logLevel!: LogLevel;

	mainPid!: number;

	appRoot!: string;
	execPath!: string;
	isInitialStartup?: boolean;

	userEnv!: IProcessEnvironment;
	nodeCachedDataDir?: string;

	backupPath?: string;

	workspace?: IWorkspaceIdentifier;
	folderUri?: ISingleFolderWorkspaceIdentifier;

	zoomLevel?: number;
	fullscreen?: boolean;
	maximized?: boolean;
	highContrast?: boolean;
	accessibilitySupport?: boolean;
	partsSplashPath?: string;

	perfStartTime?: number;
	perfAppReady?: number;
	perfWindowLoadTime?: number;
	perfEntries!: ExportData;

	filesToOpenOrCreate?: IPath[];
	filesToDiff?: IPath[];
	filesToWait?: IPathsToWaitFor;
	termProgram?: string;

	//#endregion

	private getCookieValue(name: string): string | undefined {
		const m = document.cookie.match('(^|[^;]+)\\s*' + name + '\\s*=\\s*([^;]+)'); // See https://stackoverflow.com/a/25490531

		return m ? m.pop() : undefined;
	}
}

interface IBrowserWorkbenchEnvironemntConstructionOptions extends IWorkbenchConstructionOptions {
	workspaceId: string;
	logsPath: URI;
}

interface IExtensionHostDebugEnvironment {
	params: IExtensionHostDebugParams;
	isExtensionDevelopment: boolean;
	extensionDevelopmentLocationURI: URI[];
}

export class BrowserWorkbenchEnvironmentService implements IWorkbenchEnvironmentService {

	_serviceBrand: undefined;

	//#region PROPERLY CONFIGURED

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

	@memoize
	get webviewExternalEndpoint(): string {
		// TODO: get fallback from product.json
		return (this.options.webviewEndpoint || 'https://{{uuid}}.vscode-webview-test.com/{{commit}}').replace('{{commit}}', product.commit || 'c58aaab8a1cc22a7139b761166a0d4f37d41e998');
	}

	@memoize
	get webviewResourceRoot(): string {
		return `${this.webviewExternalEndpoint}/vscode-resource/{{resource}}`;
	}

	@memoize
	get webviewCspSource(): string {
		return this.webviewExternalEndpoint.replace('{{uuid}}', '*');
	}

	//#endregion


	//#region TODO@ben TO BE DONE

	private _configuration: IWindowConfiguration | undefined = undefined;
	get configuration(): IWindowConfiguration {
		if (!this._configuration) {
			this._configuration = new BrowserWindowConfiguration(this.options, this);
		}

		return this._configuration;
	}

	readonly args = { _: [] };
	readonly appRoot = '/web/';

	argvResource!: URI;

	extensionTestsLocationURI?: URI;

	execPath!: string;
	cliPath!: string;
	userHome!: string;
	userDataPath!: string;
	appSettingsHome!: URI;

	machineSettingsHome!: URI;
	machineSettingsResource!: URI;
	globalStorageHome!: string;
	workspaceStorageHome!: string;
	backupWorkspacesPath!: string;

	disableExtensions!: boolean | string[];
	builtinExtensionsPath!: string;
	extensionsPath?: string;
	debugSearch!: IDebugParams;
	logExtensionHostCommunication!: boolean;

	wait!: boolean;
	status!: boolean;
	log?: string;

	verbose!: boolean;
	skipReleaseNotes!: boolean;
	mainIPCHandle!: string;
	sharedIPCHandle!: string;
	nodeCachedDataDir?: string;
	installSourcePath!: string;
	disableUpdates!: boolean;
	disableCrashReporter!: boolean;
	driverHandle?: string;
	driverVerbose!: boolean;
	galleryMachineIdResource?: URI;

	//#endregion

	constructor(readonly options: IBrowserWorkbenchEnvironemntConstructionOptions) { }

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
		if (this.options.workspaceProvider && Array.isArray(this.options.workspaceProvider.payload)) {
			const environment = serializableToMap(this.options.workspaceProvider.payload);
			for (const [key, value] of environment) {
				switch (key) {
					case 'extensionDevelopmentPath':
						extensionHostDebugEnvironment.extensionDevelopmentLocationURI = [URI.parse(value)];
						extensionHostDebugEnvironment.isExtensionDevelopment = true;
						break;
					case 'debugId':
						extensionHostDebugEnvironment.params.debugId = value;
						break;
					case 'inspect-brk-extensions':
						extensionHostDebugEnvironment.params.port = parseInt(value);
						extensionHostDebugEnvironment.params.break = false;
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
