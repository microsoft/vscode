/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AICustomizationManagementSection } from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { filterAICustomizationOverviewSearchItems, IAICustomizationOverviewSearchItem } from '../../../browser/aiCustomization/aiCustomizationOverviewSearch.js';

suite('AI Customization Overview Search', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const item = (id: string, name: string, state: 'inUse' | 'available', description?: string, keywords?: readonly string[]): IAICustomizationOverviewSearchItem => ({
		id,
		name,
		state,
		description,
		keywords,
		section: AICustomizationManagementSection.Agents,
		sectionLabel: 'Agents',
		sectionIcon: Codicon.agent,
	});

	test('matches supported item fields and sorts by name', () => {
		const matches = filterAICustomizationOverviewSearchItems([
			item('description', 'Zulu', 'available', 'Search helper'),
			item('name', 'Search agent', 'inUse'),
			item('keyword', 'Alpha', 'inUse', undefined, ['search']),
			item('section-only', 'Unrelated', 'inUse'),
		], 'search');

		assert.deepStrictEqual(matches.map(match => ({
			id: match.item.id,
			state: match.item.state,
			nameMatched: !!match.nameMatches,
			descriptionMatched: !!match.descriptionMatches,
		})), [
			{ id: 'keyword', state: 'inUse', nameMatched: false, descriptionMatched: false },
			{ id: 'name', state: 'inUse', nameMatched: true, descriptionMatched: false },
			{ id: 'description', state: 'available', nameMatched: false, descriptionMatched: true },
		]);
	});

	test('does not match a section label', () => {
		const matches = filterAICustomizationOverviewSearchItems([
			item('section-only', 'Unrelated', 'inUse'),
		], 'agents');

		assert.deepStrictEqual(matches, []);
	});
});
