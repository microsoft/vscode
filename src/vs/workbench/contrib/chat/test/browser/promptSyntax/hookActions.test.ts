/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { addCopilotHookToText, getCopilotHooksFolder, getHookFilesPolicyBlock, registerHookActions } from '../../../browser/promptSyntax/hookActions.js';
import { findHookCommandSelection } from '../../../browser/promptSyntax/hookUtils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { parseCopilotHooks } from '../../../common/promptSyntax/hookCompatibility.js';
import { getValidAgentHookNames, HookType } from '../../../common/promptSyntax/hookTypes.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';

suite('hookActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Configure Hooks opens the Hooks section of Chat Customizations', async () => {
		store.add(registerHookActions());
		const executed: unknown[][] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<R>(id: string, ...args: unknown[]): Promise<R | undefined> {
				executed.push([id, ...args]);
				return undefined;
			}
		}());

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.action.chat.configure.hooks')!.handler(accessor));

		assert.deepStrictEqual(executed, [[AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Hooks]]);
	});

	test('hook files are blocked by the same policies that stop them loading', () => {
		const blockFor = (values: Record<string, unknown>) => getHookFilesPolicyBlock({ getValue: (key: string) => values[key] } as Pick<IConfigurationService, 'getValue'>);
		assert.deepStrictEqual({
			none: blockFor({}),
			organizationOnly: blockFor({ [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG]: true }),
			pluginOnly: blockFor({ [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG]: true }),
		}, {
			none: undefined,
			organizationOnly: 'organizationOnly',
			pluginOnly: 'pluginOnly',
		});
	});

	test('workspace hooks go in .github/hooks at the git repository root, user hooks in the Copilot home', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));
		await fileService.createFolder(URI.file('/repo/.git'));
		await fileService.createFolder(URI.file('/home/me/.git'));
		const folderFor = async (storage: PromptsStorage.local | PromptsStorage.user, projectRoot: URI | undefined, copilotHome = URI.file('/home/me/.copilot')) => (await getCopilotHooksFolder(fileService, URI.file('/home/me'), copilotHome, storage, projectRoot))?.path;
		assert.deepStrictEqual({
			repositoryRoot: await folderFor(PromptsStorage.local, URI.file('/repo')),
			subfolder: await folderFor(PromptsStorage.local, URI.file('/repo/packages/app')),
			notARepository: await folderFor(PromptsStorage.local, URI.file('/other/folder')),
			insideHomeRepository: await folderFor(PromptsStorage.local, URI.file('/home/me/project')),
			noFolder: await folderFor(PromptsStorage.local, undefined),
			user: await folderFor(PromptsStorage.user, URI.file('/repo')),
			userWithCopilotHomeSet: await folderFor(PromptsStorage.user, URI.file('/repo'), URI.file('/custom/copilot-home')),
		}, {
			repositoryRoot: '/repo/.github/hooks',
			subfolder: '/repo/.github/hooks',
			notARepository: '/other/folder/.github/hooks',
			insideHomeRepository: '/home/me/project/.github/hooks',
			noFolder: undefined,
			user: '/home/me/.copilot/hooks',
			userWithCopilotHomeSet: '/custom/copilot-home/hooks',
		});
	});

	suite('addCopilotHookToText', () => {
		test('adds the event to a file without it, creating the hooks object when missing', () => {
			const added = (text: string, eventName: string) => {
				const result = addCopilotHookToText(text, eventName);
				return result.kind === 'added' && { json: JSON.parse(result.text), commandIndex: result.commandIndex };
			};
			assert.deepStrictEqual([
				added('{\n\t"version": 1,\n\t"hooks": {}\n}', 'preToolUse'),
				added('{ "version": 1 }', 'sessionStart'),
			], [
				{ json: { version: 1, hooks: { preToolUse: [{ type: 'command', command: '' }] } }, commandIndex: 0 },
				{ json: { version: 1, hooks: { sessionStart: [{ type: 'command', command: '' }] } }, commandIndex: 0 },
			]);
		});

		test('appends to an existing event and keeps comments', () => {
			const text = [
				'{',
				'\t// keep me',
				'\t"hooks": {',
				'\t\t"preToolUse": [',
				'\t\t\t{ "type": "command", "command": "first" },',
				'\t\t\t{ "matcher": "", "hooks": [{ "type": "command", "command": "a" }, { "type": "command", "command": "b" }] }',
				'\t\t]',
				'\t}',
				'}',
			].join('\n');
			const result = addCopilotHookToText(text, 'preToolUse');
			assert.deepStrictEqual(result.kind === 'added' && {
				keepsComment: result.text.includes('// keep me'),
				commandIndex: result.commandIndex,
				selected: findHookCommandSelection(result.text, 'preToolUse', result.commandIndex, 'command') !== undefined,
			}, {
				keepsComment: true,
				commandIndex: 3,
				selected: true,
			});
		});

		test('leaves content it cannot edit safely', () => {
			assert.deepStrictEqual([
				addCopilotHookToText('{ "hooks": ', 'preToolUse'),
				addCopilotHookToText('[]', 'preToolUse'),
				addCopilotHookToText('{ "hooks": [] }', 'preToolUse'),
				addCopilotHookToText('{ "hooks": { "preToolUse": {} } }', 'preToolUse'),
			].map(result => result.kind), ['invalid', 'invalid', 'invalid', 'invalid']);
		});

		test('never hides existing older-format hooks: refuses the same event, adds others', () => {
			const text = '{ "hooks": { "PreToolUse": [{ "type": "command", "command": "deny-script" }] } }';
			assert.deepStrictEqual(addCopilotHookToText(text, 'preToolUse'), { kind: 'conflictingEventName', existingEventName: 'PreToolUse' });
			const retained = getValidAgentHookNames(Target.GitHubCopilot, false).filter(eventName => {
				const result = addCopilotHookToText(text, eventName);
				const edited = result.kind === 'added' ? result.text : text;
				const preToolUse = parseCopilotHooks(JSON.parse(edited), undefined, '').get(HookType.PreToolUse);
				return preToolUse?.hooks.some(hook => hook.command === 'deny-script');
			});
			assert.deepStrictEqual(retained, getValidAgentHookNames(Target.GitHubCopilot, false));
		});
	});
});
