/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { localize } from 'vs/nls';
import { IViewsService, ViewsRegistry, IViewDescriptor } from 'vs/workbench/common/views';
import { OutlinePanel } from './outlinePanel';
import { MenuRegistry } from 'vs/platform/actions/common/actions';
import { VIEW_CONTAINER } from 'vs/workbench/parts/files/common/files';

const _outlineDesc = <IViewDescriptor>{
	id: 'code.outline',
	name: localize('name', "Outline"),
	ctor: OutlinePanel,
	container: VIEW_CONTAINER,
	canToggleVisibility: true,
	hideByDefault: false,
	collapsed: true,
	order: 2,
	weight: 30
};

ViewsRegistry.registerViews([_outlineDesc]);

CommandsRegistry.registerCommand('outline.focus', accessor => {
	let viewsService = accessor.get(IViewsService);
	return viewsService.openView(_outlineDesc.id, true);
});

MenuRegistry.addCommand({
	id: 'outline.focus',
	category: localize('category.focus', "File"),
	title: localize('label.focus', "Focus on Outline")
});
