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
import { memoize } from 'vs/base/common/decorators';

// TODO@Ben TODO@Joao this interface should be composed once the main => renderer
// communication is also fit for that
export interface IEnvironment extends ParsedArgs {
	execPath: string;
}

export class EnvironmentService implements IEnvironmentService {

	_serviceBrand: any;

	@memoize
	get appRoot(): string { return path.dirname(URI.parse(require.toUrl('')).fsPath); }
	get execPath(): string { return this.args.execPath; }

	@memoize
	get userHome(): string { return path.join(os.homedir(), product.dataFolderName); }

	@memoize
	get userDataPath(): string { return this.args['user-data-dir'] || paths.getDefaultUserDataPath(process.platform); }

	@memoize
	get appSettingsHome(): string { return path.join(this.userDataPath, 'User'); }

	@memoize
	get appSettingsPath(): string { return path.join(this.appSettingsHome, 'settings.json'); }

	@memoize
	get appKeybindingsPath(): string { return path.join(this.appSettingsHome, 'keybindings.json'); }

	@memoize
	get extensionsPath(): string { return path.normalize(this.args.extensionHomePath || path.join(this.userHome, 'extensions')); }

	get extensionDevelopmentPath(): string { return this.args.extensionDevelopmentPath; }

	get extensionTestsPath(): string { return this.args.extensionTestsPath; }
	get disableExtensions(): boolean { return this.args['disable-extensions'];  }

	@memoize
	get debugExtensionHost(): { port: number; break: boolean; } { return parseExtensionHostPort(this.args, this.isBuilt); }

	get isBuilt(): boolean { return !process.env['VSCODE_DEV']; }
	get verbose(): boolean { return this.args.verbose; }
	get performance(): boolean { return this.args.performance; }
	get logExtensionHostCommunication(): boolean { return this.args.logExtensionHostCommunication; }

	constructor(private args: IEnvironment) {}
}

export function parseExtensionHostPort(args: ParsedArgs, isBuild: boolean): { port: number; break: boolean; } {
	const portStr = args.debugBrkPluginHost || args.debugPluginHost;
	const port = Number(portStr) || (!isBuild ? 5870 : null);
	const brk = port ? Boolean(!!args.debugBrkPluginHost) : false;
	return { port, break: brk };
}