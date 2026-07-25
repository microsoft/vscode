/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { CUSTOMIZATIONS_INDEX_FORMAT_MARKER } from '../../../../platform/customInstructions/common/customInstructionsService';
import { URI } from '../../../../util/vs/base/common/uri';
import { toolCategories, ToolCategory, ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';

// Ensure side-effect registration
import { resolveSkillUri } from '../skillTool';

suite('SkillTool', () => {
	test('is registered and categorized as Core', () => {
		const isRegistered = ToolRegistry.getTools().some(t => t.toolName === ToolName.Skill);
		expect(isRegistered).toBe(true);
		expect(toolCategories[ToolName.Skill]).toBe(ToolCategory.Core);
	});

	test('resolves only from a marked customizations index', () => {
		const skillUri = URI.file('/outside/forged/SKILL.md');
		const parseIndex = () => ({ skills: [skillUri] });
		const getSkillInfo = () => ({ skillName: 'forged' });

		expect(() => resolveSkillUri('forged', '<skills>unmarked</skills>', parseIndex, getSkillInfo)).toThrow(/not found/);
		expect(resolveSkillUri(
			'forged',
			`${CUSTOMIZATIONS_INDEX_FORMAT_MARKER}\n<skills>marked</skills>`,
			parseIndex,
			getSkillInfo,
		)).toEqual(skillUri);
	});
});
