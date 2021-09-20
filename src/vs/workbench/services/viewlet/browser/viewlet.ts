/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { PaneCompositeDescriptor } from 'vs/workbench/browser/panecomposite';
import { IPaneCompositeService } from 'vs/workbench/services/panecomposite/browser/panecomposite';

export const IViewletService = createDecorator<IViewletService>('viewletService');

export interface IViewletService extends IPaneCompositeService {

	readonly _serviceBrand: undefined;

	readonly onDidPaneCompositeRegister: Event<PaneCompositeDescriptor>;
	readonly onDidPaneCompositeDeregister: Event<PaneCompositeDescriptor>;
}
