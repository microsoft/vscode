/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { ViewsRegistry, ViewLocation, IViewsService } from 'vs/workbench/common/views';
import { OutlinePanel } from './outlinePanel';
import { CommandsRegistry } from '../../../../platform/commands/common/commands';

const _outlineDesc = {
	id: 'code.outline',
	name: localize('name', "Outline"),
	ctor: OutlinePanel,
	location: ViewLocation.Explorer,
	canToggleVisibility: true
};

ViewsRegistry.registerViews([_outlineDesc]);

CommandsRegistry.registerCommand('outline.focus', accessor => {
	let viewsService = accessor.get(IViewsService);
	return viewsService.openView(_outlineDesc.id, true);
});
