/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionTipsService, IExecutableBasedExtensionTip, IWorkspaceTips } from 'vs/platform/extensionManagement/common/extensionManagement';

class WebExtensionTipsService implements IExtensionTipsService {

	_serviceBrand: any;

	constructor() { }

	async getImportantExecutableBasedTips(): Promise<IExecutableBasedExtensionTip[]> {
		return [];
	}

	async getOtherExecutableBasedTips(): Promise<IExecutableBasedExtensionTip[]> {
		return [];
	}

	async getAllWorkspacesTips(): Promise<IWorkspaceTips[]> {
		return [];
	}

}

registerSingleton(IExtensionTipsService, WebExtensionTipsService);
