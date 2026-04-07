/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { toolCategories, ToolCategory, ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';

// Ensure side-effect registration
import '../searchSubagentTool';

suite('SearchSubagentTool', () => {
	test('is registered and categorized as Core', () => {
		const isRegistered = ToolRegistry.getTools().some(t => t.toolName === ToolName.SearchSubagent);
		expect(isRegistered).toBe(true);
		expect(toolCategories[ToolName.SearchSubagent]).toBe(ToolCategory.Core);
	});
});
