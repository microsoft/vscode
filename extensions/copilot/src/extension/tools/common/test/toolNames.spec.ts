/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { ContributedToolName, getContributedToolName, getToolName, mapContributedToolNamesInSchema, mapContributedToolNamesInString, ToolName } from '../toolNames';

describe('ToolNames', () => {
	it('Can map tool names', async () => {
		expect(getContributedToolName(ToolName.ApplyPatch)).toBe(ContributedToolName.ApplyPatch);
		expect(getToolName(ContributedToolName.ApplyPatch)).toBe(ToolName.ApplyPatch);
	});

	it('returns original name for unmapped core tools', () => {
		// Core tool without a contributed alias
		const unmapped = ToolName.CoreRunInTerminal;
		const mapped = getContributedToolName(unmapped);
		expect(mapped).toBe(unmapped);
	});

	it('mapContributedToolNamesInString replaces all contributed tool names with core names', () => {
		const input = `Use ${ContributedToolName.ReplaceString} and ${ContributedToolName.ReadFile} in sequence.`;
		const output = mapContributedToolNamesInString(input);
		expect(output).toContain(ToolName.ReplaceString);
		expect(output).toContain(ToolName.ReadFile);
		expect(output).not.toContain(ContributedToolName.ReplaceString);
		expect(output).not.toContain(ContributedToolName.ReadFile);
	});

	it('mapContributedToolNamesInSchema replaces strings recursively', () => {
		const schema = {
			one: `before ${ContributedToolName.ReplaceString} after`,
			nested: {
				two: `${ContributedToolName.ReadFile}`,
				arr: [
					`${ContributedToolName.FindFiles}`,
					42,
					{ three: `${ContributedToolName.FindTextInFiles}` },
				],
			},
			unchanged: 123,
		};
		const mapped: any = mapContributedToolNamesInSchema(schema);
		expect(mapped.one).toContain(ToolName.ReplaceString);
		expect(mapped.nested.two).toBe(ToolName.ReadFile);
		expect(mapped.nested.arr[0]).toBe(ToolName.FindFiles);
		expect(mapped.nested.arr[1]).toBe(42);
		expect(mapped.nested.arr[2].three).toBe(ToolName.FindTextInFiles);
		expect(mapped.unchanged).toBe(123);
	});
});