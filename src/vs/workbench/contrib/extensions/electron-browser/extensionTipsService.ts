/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseExtensionTipsService } from 'vs/workbench/contrib/extensions/browser/extensionTipsService';
import { IProcessEnvironment } from 'vs/base/common/platform';

export class ExtensionTipsService extends BaseExtensionTipsService {

	protected getProcessEnvironment(): IProcessEnvironment {
		return process.env as IProcessEnvironment;
	}

}
