/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeIcon } from './themables.js';
import { register } from './codiconsUtil.js';
import { codiconsLibrary } from './codiconsLibrary.js';


/**
 * Only to be used by the iconRegistry.
 */
export function getAllCodicons(): ThemeIcon[] {
	return Object.values(Codicon);
}

/**
 * Derived icons, that could become separate icons.
 * These mappings should be moved into the mapping file in the vscode-codicons repo at some point.
 */
export const codiconsDerived = {
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
	quickInputBack: register('quick-input-back', 'arrow-left'),
	dropDownButton: register('drop-down-button', 0xeab4),
	symbolCustomColor: register('symbol-customcolor', 0xeb5c),
	exportIcon: register('export', 0xebac),
	workspaceUnspecified: register('workspace-unspecified', 0xebc3),
	newLine: register('newline', 0xebea),
	thumbsDownFilled: register('thumbsdown-filled', 0xec13),
	thumbsUpFilled: register('thumbsup-filled', 0xec14),
	gitFetch: register('git-fetch', 0xec1d),
	lightbulbSparkleAutofix: register('lightbulb-sparkle-autofix', 0xec1f),
	debugBreakpointPending: register('debug-breakpoint-pending', 0xebd9),
	chatImport: register('chat-import', 0xec86),
	chatExport: register('chat-export', 0xec87),

} as const;

/**
 * The Codicon library is a set of default icons that are built-in in VS Code.
 *
 * In the product (outside of base) Codicons should only be used as defaults. In order to have all icons in VS Code
 * themeable, component should define new, UI component specific icons using `iconRegistry.registerIcon`.
 * In that call a Codicon can be named as default.
 */
export const Codicon = {
	...codiconsLibrary,
	...codiconsDerived

} as const;

const compactCodiconSuffix = '-compact';

let compactCodiconsById: Map<string, ThemeIcon> | undefined;

/**
 * Returns the 12px-optimized `*-compact` variant of the given codicon if one
 * exists, otherwise returns the icon unchanged. Use this when rendering an
 * arbitrary codicon at the compact codicon size (`--vscode-codiconFontSize-compact`)
 * so the visually-distinct compact glyph is drawn instead of a scaled-down full glyph.
 */
export function getCompactCodicon(icon: ThemeIcon): ThemeIcon {
	if (!compactCodiconsById) {
		compactCodiconsById = new Map();
		for (const codicon of Object.values(codiconsLibrary)) {
			if (codicon.id.endsWith(compactCodiconSuffix)) {
				compactCodiconsById.set(codicon.id.slice(0, -compactCodiconSuffix.length), codicon);
			}
		}
	}
	return compactCodiconsById.get(icon.id) ?? icon;
}
