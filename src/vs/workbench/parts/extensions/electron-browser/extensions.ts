/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {IViewlet} from 'vs/workbench/common/viewlet';

export const VIEWLET_ID = 'workbench.viewlet.extensions';

export interface IExtensionsViewlet extends IViewlet {
	search(text: string, immediate?: boolean): void;
}
