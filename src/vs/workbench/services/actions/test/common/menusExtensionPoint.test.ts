/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { schema } from '../../../extensions/common/extensionsRegistry.js';
import '../../common/menusExtensionPoint.js';

suite('menus extension point schema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/** The groups suggested for the command item and, when the menu supports submenus, the submenu item. */
	function suggestedGroups(menu: IJSONSchema | boolean | undefined): (unknown[] | undefined)[] {
		const items = typeof menu === 'object' && !Array.isArray(menu.items) ? menu.items : undefined;
		return (items?.oneOf ?? [items]).map(item => item?.properties?.group?.examples);
	}

	test('group suggests the groups of the menu the item is contributed to', () => {
		const menus = schema.properties?.contributes.properties?.menus;

		assert.deepStrictEqual({
			'editor/context': suggestedGroups(menus?.properties?.['editor/context']),
			'timeline/item/context': suggestedGroups(menus?.properties?.['timeline/item/context']),
			'view/title': suggestedGroups(menus?.properties?.['view/title']),
			'view/item/context': suggestedGroups(menus?.properties?.['view/item/context']),
			'commandPalette': suggestedGroups(menus?.properties?.commandPalette),
			'contributed submenu': suggestedGroups(menus?.additionalProperties)
		}, {
			'editor/context': [
				['navigation', '1_modification', '9_cutcopypaste', 'z_commands'],
				['navigation', '1_modification', '9_cutcopypaste', 'z_commands']
			],
			'timeline/item/context': [
				['inline', '1_actions', '5_copy'],
				['inline', '1_actions', '5_copy']
			],
			'view/title': [['navigation'], ['navigation']],
			'view/item/context': [['navigation', 'inline'], ['navigation', 'inline']],
			'commandPalette': [[]],
			'contributed submenu': [['navigation'], ['navigation']]
		});
	});
});
