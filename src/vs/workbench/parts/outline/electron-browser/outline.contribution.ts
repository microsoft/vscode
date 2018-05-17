/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { localize } from 'vs/nls';
import { IViewsService, ViewLocation, ViewsRegistry, IViewDescriptor } from 'vs/workbench/common/views';
import { OutlinePanel } from './outlinePanel';

const _outlineDesc = <IViewDescriptor>{
	id: 'code.outline',
	name: localize('name', "Outline"),
	ctor: OutlinePanel,
	location: ViewLocation.Explorer,
	canToggleVisibility: true,
	hideByDefault: true,
	order: 2
};

ViewsRegistry.registerViews([_outlineDesc]);

CommandsRegistry.registerCommand('outline.focus', accessor => {
	let viewsService = accessor.get(IViewsService);
	return viewsService.openView(_outlineDesc.id, true);
});
