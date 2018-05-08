/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { ViewsRegistry, ViewLocation } from 'vs/workbench/common/views';
import { OutlinePanel } from './outlinePanel';

// get outline tree (per extension...)

// sorting by range, name, type

ViewsRegistry.registerViews([{
	id: 'code.outline',
	name: localize('name', "Outline"),
	ctor: OutlinePanel,
	location: ViewLocation.Explorer,
	canToggleVisibility: true
}]);
