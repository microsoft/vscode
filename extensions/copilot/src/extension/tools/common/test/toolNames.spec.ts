/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import packageJson from '../../../../../package.json';
import { ContributedToolName, getContributedToolName, getToolName, mapContributedToolNamesInSchema, mapContributedToolNamesInString, ToolName } from '../toolNames';

describe('ToolNames', () => {
	it('retires workspace generation without removing standard project tools', () => {
		const toolNames = packageJson.contributes.languageModelTools.map(tool => tool.name);
		const retiredSettings = [
			'github.copilot.chat.newWorkspaceCreation.enabled',
			'github.copilot.chat.newWorkspace.useContext7',
			'github.copilot.chat.useProjectTemplates',
		];

		expect({
			workspaceAliases: [
				...Object.values(ToolName),
				...Object.values(ContributedToolName),
				...toolNames,
				...packageJson.contributes.languageModelToolSets.flatMap(toolSet => toolSet.tools),
			].filter(name => ['create_new_workspace', 'copilot_createNewWorkspace', 'newWorkspace'].includes(name)),
			workspaceCommands: packageJson.contributes.chatParticipants.flatMap(participant => participant.commands ?? []).filter(command => command.name === 'new'),
			workspaceSettings: packageJson.contributes.configuration.flatMap(configuration => Object.keys(configuration.properties)).filter(key => retiredSettings.includes(key)),
			workspaceSkills: packageJson.contributes.chatSkills.filter(skill => skill.path.includes('project-setup-info')),
			retainedTools: [
				ContributedToolName.CreateFile,
				ContributedToolName.CreateDirectory,
				ContributedToolName.CreateNewJupyterNotebook,
			].filter(name => toolNames.includes(name)),
		}).toEqual({
			workspaceAliases: [],
			workspaceCommands: [],
			workspaceSettings: [],
			workspaceSkills: [],
			retainedTools: [
				ContributedToolName.CreateFile,
				ContributedToolName.CreateDirectory,
				ContributedToolName.CreateNewJupyterNotebook,
			],
		});
	});

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