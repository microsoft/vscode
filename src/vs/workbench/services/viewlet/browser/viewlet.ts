/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { PaneCompositeDescriptor } from 'vs/workbench/browser/panecomposite';
import { IPaneCompositePart } from 'vs/workbench/browser/parts/paneCompositePart';

export interface ISideBarPart extends IPaneCompositePart {

	readonly _serviceBrand: undefined;

	readonly onDidPaneCompositeRegister: Event<PaneCompositeDescriptor>;
	readonly onDidPaneCompositeDeregister: Event<PaneCompositeDescriptor>;
}
