/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AppDetailsOptions } from 'electron';
import { win32 } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IProductService } from '../../product/common/productService.js';

export function getWindowsAppDetails(productService: IProductService, environmentService: IEnvironmentMainService, isAgentsWindow: boolean, executablePath = process.execPath): AppDetailsOptions | undefined {
	if (!productService.win32AppUserModelId) {
		return undefined;
	}

	const args = [executablePath];
	if (!environmentService.isBuilt) {
		args.push(environmentService.appRoot);
	}
	if (isAgentsWindow) {
		args.push('--agents');
	}
	if (environmentService.args['user-data-dir']) {
		args.push('--user-data-dir', environmentService.userDataPath);
	}
	if (environmentService.args['extensions-dir']) {
		args.push('--extensions-dir', environmentService.extensionsPath);
	}
	if (environmentService.args['shared-data-dir']) {
		args.push('--shared-data-dir', environmentService.appSharedDataHome.fsPath);
	}

	return {
		appId: `${productService.win32AppUserModelId}${environmentService.isPortable ? '.Portable' : ''}${isAgentsWindow ? '.Agents' : ''}`,
		appIconPath: isAgentsWindow
			? environmentService.isBuilt ? win32.join(win32.dirname(executablePath), 'agents.ico') : win32.join(environmentService.appRoot, 'resources', 'win32', 'sessions.ico')
			: executablePath,
		appIconIndex: 0,
		relaunchCommand: args.map(arg => `"${arg.replace(/(?<slashes>\\*)"/g, '$<slashes>$<slashes>\\"').replace(/(?<slashes>\\+)$/g, '$<slashes>$<slashes>')}"`).join(' '),
		relaunchDisplayName: isAgentsWindow ? localize('agentsApplicationName', "{0} Agents", productService.nameLong) : productService.nameLong,
	};
}
