/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {IEnvironmentService} from 'vs/platform/environment/common/environment';
import * as paths from 'vs/base/node/paths';
import product from 'vs/platform/product';
import * as os from 'os';
import * as path from 'path';
import {ParsedArgs} from 'vs/code/node/argv';
import URI from 'vs/base/common/uri';

export class EnvironmentService implements IEnvironmentService {

	_serviceBrand: any;

	private _appRoot: string;
	get appRoot(): string { return this._appRoot; }

	private _userHome: string;
	get userHome(): string { return this._userHome; }

	private _userDataPath: string;
	get userDataPath(): string { return this._userDataPath; }

	private _appSettingsHome: string;
	get appSettingsHome(): string { return this._appSettingsHome; }

	private _appSettingsPath: string;
	get appSettingsPath(): string { return this._appSettingsPath; }

	private _appKeybindingsPath: string;
	get appKeybindingsPath(): string { return this._appKeybindingsPath; }

	private _extensionsPath: string;
	get extensionsPath(): string { return this._extensionsPath; }

	private _extensionDevelopmentPath: string;
	get extensionDevelopmentPath(): string { return this._extensionDevelopmentPath; }

	get isBuilt(): boolean { return !process.env['VSCODE_DEV']; }
	get verbose(): boolean { return this.args.verbose; }

	get debugBrkFileWatcherPort(): number { return typeof this.args.debugBrkFileWatcherPort === 'string' ? Number(this.args.debugBrkFileWatcherPort) : void 0; }

	constructor(private args: ParsedArgs) {
		this._appRoot = path.dirname(URI.parse(require.toUrl('')).fsPath);
		this._userDataPath = args['user-data-dir'] || paths.getDefaultUserDataPath(process.platform);

		this._appSettingsHome = path.join(this.userDataPath, 'User');
		this._appSettingsPath = path.join(this.appSettingsHome, 'settings.json');
		this._appKeybindingsPath = path.join(this.appSettingsHome, 'keybindings.json');

		this._userHome = path.join(os.homedir(), product.dataFolderName);
		this._extensionsPath = args.extensionHomePath || path.join(this._userHome, 'extensions');
		this._extensionsPath = path.normalize(this._extensionsPath);

		this._extensionDevelopmentPath = args.extensionDevelopmentPath;
	}
}