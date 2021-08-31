/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from 'vs/base/browser/ui/aria/aria';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IAriaAlertService } from 'vs/workbench/services/accessibility/common/ariaAlertService';

export class AriaAlertService implements IAriaAlertService {
	_serviceBrand: undefined;

	alert(msg: string): void {
		alert(msg);
	}
}

registerSingleton(IAriaAlertService, AriaAlertService);
