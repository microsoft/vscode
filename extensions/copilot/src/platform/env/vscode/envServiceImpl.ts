/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Platform, platform } from '../../../util/vs/base/common/platform';
import { IEnvService, NameAndVersion, OperatingSystem } from '../common/envService';
import { isPreRelease, isProduction, packageJson } from '../common/packagejson';

export class EnvServiceImpl implements IEnvService {

	declare readonly _serviceBrand: undefined;

	public get extensionId(): string {
		return `${packageJson.publisher}.${packageJson.name}`.toLowerCase();
	}

	public get sessionId(): string {
		return vscode.env.sessionId;
	}
	public get machineId(): string {
		return vscode.env.machineId;
	}
	public get devDeviceId(): string {
		return vscode.env.devDeviceId;
	}
	public get vscodeVersion(): string {
		return vscode.version;
	}
	public get remoteName(): string | undefined {
		return vscode.env.remoteName;
	}
	public get uiKind(): 'desktop' | 'web' {
		switch (vscode.env.uiKind) {
			case vscode.UIKind.Desktop: return 'desktop';
			case vscode.UIKind.Web: return 'web';
		}
	}

	public get isActive(): boolean {
		return vscode.window.state.active;
	}

	public get onDidChangeWindowState(): vscode.Event<vscode.WindowState> {
		return vscode.window.onDidChangeWindowState;
	}

	public get OS(): OperatingSystem {
		switch (platform) {
			case Platform.Windows:
				return OperatingSystem.Windows;
			case Platform.Mac:
				return OperatingSystem.Macintosh;
			case Platform.Linux:
				return OperatingSystem.Linux;
			default:
				return OperatingSystem.Linux;
		}
	}

	get language() {
		return vscode.env.language;
	}

	get uriScheme(): string {
		return vscode.env.uriScheme;
	}

	get appRoot(): string {
		return vscode.env.appRoot;
	}

	get shell(): string {
		return vscode.env.shell;
	}

	isProduction(): boolean {
		return isProduction;
	}

	isPreRelease(): boolean {
		return isPreRelease;
	}

	isSimulation(): boolean {
		return false;
	}

	getBuildType(): 'prod' | 'dev' {
		return packageJson.buildType;
	}

	getVersion(): string {
		return packageJson.version;
	}

	getBuild(): string {
		return packageJson.build;
	}

	getName(): string {
		return packageJson.name;
	}

	getEditorInfo(): NameAndVersion {
		return new NameAndVersion('vscode', vscode.version);
	}
	getEditorPluginInfo(): NameAndVersion {
		return new NameAndVersion('copilot-chat', packageJson.version);
	}

	openExternal(target: vscode.Uri): Promise<boolean> {
		return new Promise((resolve, reject) => vscode.env.openExternal(target).then(resolve, reject));
	}
}
