/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { register } from 'vs/base/common/codiconsUtil';


// Derived icons, that could become separate icons.
// These mappings should be moved into the vscode-codicons mapping file at some point
export const codiconsExtra = {
	dialogError: register('dialog-error', 'error'),
	dialogWarning: register('dialog-warning', 'warning'),
	dialogInfo: register('dialog-info', 'info'),
	dialogClose: register('dialog-close', 'close'),
	treeItemExpanded: register('tree-item-expanded', 'chevron-down'), // collapsed is done with rotation
	treeFilterOnTypeOn: register('tree-filter-on-type-on', 'list-filter'),
	treeFilterOnTypeOff: register('tree-filter-on-type-off', 'list-selection'),
	treeFilterClear: register('tree-filter-clear', 'close'),
	treeItemLoading: register('tree-item-loading', 'loading'),
	menuSelection: register('menu-selection', 'check'),
	menuSubmenu: register('menu-submenu', 'chevron-right'),
	menuBarMore: register('menubar-more', 'more'),
	scrollbarButtonLeft: register('scrollbar-button-left', 'triangle-left'),
	scrollbarButtonRight: register('scrollbar-button-right', 'triangle-right'),
	scrollbarButtonUp: register('scrollbar-button-up', 'triangle-up'),
	scrollbarButtonDown: register('scrollbar-button-down', 'triangle-down'),
	toolBarMore: register('toolbar-more', 'more'),
	quickInputBack: register('quick-input-back', 'arrow-left')

} as const;
