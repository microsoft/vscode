/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EXTENSIONS_AGENTS_WINDOW_MANAGEMENT } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotification, INotificationHandle, INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { AICustomizationManagementCommands } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementSection } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { manageExtension } from '../../browser/agentsWindowExtensionManageCommand.js';

suite('AgentsWindowExtensionManageCommand', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function runManageExtension(management: boolean, options?: { showsExtensions: boolean }): Promise<{ commands: unknown[][]; notifications: string[]; shownExtensions: string[] }> {
		const commands: unknown[][] = [];
		const notifications: string[] = [];
		const shownExtensions: string[] = [];
		const activeEditorPane = options ? upcastPartial<IVisibleEditorPane>(Object.assign(Object.create(AICustomizationManagementEditor.prototype) as AICustomizationManagementEditor, {
			getActiveSectionWidget: () => options.showsExtensions ? { showExtension: (extensionId: string) => { shownExtensions.push(extensionId); } } : {}
		})) : undefined;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [EXTENSIONS_AGENTS_WINDOW_MANAGEMENT]: management }));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (id: string, ...args: unknown[]) => { commands.push([id, ...args]); return undefined; }
		}));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ activeEditorPane }));
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override notify(notification: INotification): INotificationHandle {
				notifications.push(String(notification.message));
				return super.notify(notification);
			}
		});

		await instantiationService.invokeFunction(accessor => manageExtension(accessor, 'pub.ext'));
		return { commands, notifications, shownExtensions };
	}

	test('says that it can\'t manage the extension when the Agents window doesn\'t manage extensions', async () => {
		assert.deepStrictEqual(await runManageExtension(false), {
			commands: [],
			notifications: ['Extension \'pub.ext\' can\'t be managed in this window right now.'],
			shownExtensions: [],
		});
	});

	test('shows the extension\'s page in the Extensions section of Agent Customizations', async () => {
		assert.deepStrictEqual(await runManageExtension(true, { showsExtensions: true }), {
			commands: [[AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Extensions]],
			notifications: [],
			shownExtensions: ['pub.ext'],
		});
	});

	test('opens the Extensions section of Agent Customizations, and says when it can\'t show the extension there', async () => {
		assert.deepStrictEqual(await runManageExtension(true, { showsExtensions: false }), {
			commands: [[AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Extensions]],
			notifications: ['Extension \'pub.ext\' can\'t be managed in this window right now.'],
			shownExtensions: [],
		});
	});
});
