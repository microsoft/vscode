/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatCustomizationsLocation, resolveChatCustomizationsLocation } from '../../common/customizationsLocation.js';

suite('Chat customizations location', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves window defaults and applies explicit placements independently of sidebar navigation', () => {
		const locations: ChatCustomizationsLocation[] = ['auto', 'sidebar', 'sessionsHeader', 'chatToolbar', 'chatInput'];
		assert.deepStrictEqual(locations.map(location => ({
			location,
			editor: resolveChatCustomizationsLocation(location, false, false),
			agents: resolveChatCustomizationsLocation(location, true, false),
			rearrangedAgents: resolveChatCustomizationsLocation(location, true, true),
		})), [
			{ location: 'auto', editor: 'chatToolbar', agents: 'sidebar', rearrangedAgents: 'sessionsHeader' },
			{ location: 'sidebar', editor: 'chatToolbar', agents: 'sidebar', rearrangedAgents: 'sidebar' },
			{ location: 'sessionsHeader', editor: 'chatToolbar', agents: 'sessionsHeader', rearrangedAgents: 'sessionsHeader' },
			{ location: 'chatToolbar', editor: 'chatToolbar', agents: 'chatToolbar', rearrangedAgents: 'chatToolbar' },
			{ location: 'chatInput', editor: 'chatInput', agents: 'chatInput', rearrangedAgents: 'chatInput' },
		]);
	});
});
