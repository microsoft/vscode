/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import { IWindowsService, OpenContext } from 'vs/platform/windows/common/windows';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { Schemas } from 'vs/base/common/network';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';

// @deprecated this should eventually go away and be implemented by host & electron service
export class LegacyWindowsMainService extends Disposable implements IWindowsService, IURLHandler {

	_serviceBrand: undefined;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IURLService urlService: IURLService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		urlService.registerHandler(this);
	}

	async openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void> {
		this.logService.trace('windowsService#openExtensionDevelopmentHostWindow ' + JSON.stringify(args));

		const extDevPaths = args.extensionDevelopmentPath;
		if (extDevPaths) {
			this.windowsMainService.openExtensionDevelopmentHostWindow(extDevPaths, {
				context: OpenContext.API,
				cli: args,
				userEnv: Object.keys(env).length > 0 ? env : undefined
			});
		}
	}

	async handleURL(uri: URI): Promise<boolean> {

		// Catch file URLs
		if (uri.authority === Schemas.file && !!uri.path) {
			this.openFileForURI(URI.file(uri.fsPath)); // using fsPath on a non-file URI...
			return true;
		}

		return false;
	}

	private openFileForURI(uri: URI): void {
		const cli = assign(Object.create(null), this.environmentService.args);
		const urisToOpen = [{ fileUri: uri }];

		this.windowsMainService.open({ context: OpenContext.API, cli, urisToOpen, gotoLineMode: true });
	}
}
