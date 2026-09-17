/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WindowState } from 'vscode';
import { Event } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';
import { AbstractEnvService, NameAndVersion, OperatingSystem } from './envService';
import { packageJson } from './packagejson';

export class NullEnvService extends AbstractEnvService {
	declare readonly _serviceBrand: undefined;

	static readonly Instance = new NullEnvService();

	override readonly language: string = 'en';

	override get extensionId(): string {
		return 'test-extension-id';
	}

	get vscodeVersion(): string {
		return 'test-version';
	}

	override get isActive(): boolean {
		return true;
	}

	override get onDidChangeWindowState(): Event<WindowState> {
		return Event.None;
	}

	override get sessionId(): string {
		return 'test-session';
	}

	override get machineId(): string {
		return 'test-machine';
	}

	override get devDeviceId(): string {
		return 'test-dev-device';
	}

	override get remoteName(): string | undefined {
		return undefined;
	}

	override get uiKind(): 'desktop' | 'web' {
		return 'desktop';
	}

	override get uriScheme(): string {
		return 'code-null';
	}

	override get appRoot(): string {
		return '';
	}

	override get shell(): string {
		return 'zsh';
	}

	override get OS(): OperatingSystem {
		return OperatingSystem.Linux;
	}

	override getEditorInfo(): NameAndVersion {
		return new NameAndVersion('simulation-tests-editor', packageJson.engines.vscode.match(/\d+\.\d+/)?.[0] ?? '1.89');
	}

	override getEditorPluginInfo(): NameAndVersion {
		return new NameAndVersion('simulation-tests-plugin', '2');
	}

	override openExternal(target: URI): Promise<boolean> {
		return Promise.resolve(false);
	}
}

export class NullNativeEnvService extends NullEnvService {
	get userHome(): URI {
		return URI.file('/home/testuser');
	}
}