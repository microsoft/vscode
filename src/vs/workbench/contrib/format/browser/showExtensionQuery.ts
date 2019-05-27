/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { VIEWLET_ID, IExtensionsViewlet } from 'vs/workbench/contrib/extensions/common/extensions';

export function showExtensionQuery(viewletService: IViewletService, query: string) {
	return viewletService.openViewlet(VIEWLET_ID, true).then(viewlet => {
		if (viewlet) {
			(viewlet as IExtensionsViewlet).search(query);
		}
	});
}
