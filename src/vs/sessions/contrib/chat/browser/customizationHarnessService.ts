/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { basename } from '../../../../base/common/path.js';
import {
	CustomizationHarness,
	CustomizationHarnessServiceBase,
	IExternalCustomizationItem,
	IExternalCustomizationItemProvider,
	createCliHarnessDescriptor,
	getCliUserRoots,
} from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { BUILTIN_STORAGE } from '../common/builtinPromptsStorage.js';

/**
 * Sessions-window override of the customization harness service.
 *
 * Only the CLI harness is registered because sessions always run via
 * the Copilot CLI. With a single harness the toggle bar is hidden.
 *
 * A built-in itemProvider wraps IPromptsService so that the management
 * editor can display items without needing an extension-contributed provider.
 */
export class SessionsCustomizationHarnessService extends CustomizationHarnessServiceBase {
	constructor(
		@IPathService pathService: IPathService,
		@IPromptsService promptsService: IPromptsService,
	) {
		const userHome = pathService.userHome({ preferLocal: true });
		const extras = [BUILTIN_STORAGE];

		const emitter = new Emitter<void>();

		const itemProvider: IExternalCustomizationItemProvider = {
			onDidChange: emitter.event,
			async provideChatSessionCustomizations(token: CancellationToken): Promise<IExternalCustomizationItem[] | undefined> {
				const [agents, skills, instructions, prompts, hooks] = await Promise.all([
					promptsService.getCustomAgents(token),
					promptsService.findAgentSkills(token),
					promptsService.listPromptFiles(PromptsType.instructions, token),
					promptsService.listPromptFiles(PromptsType.prompt, token),
					promptsService.listPromptFiles(PromptsType.hook, token),
				]);

				const items: IExternalCustomizationItem[] = [];

				for (const agent of agents ?? []) {
					items.push({ uri: agent.uri, type: PromptsType.agent, name: agent.name, description: agent.description });
				}
				for (const skill of skills ?? []) {
					items.push({ uri: skill.uri, type: PromptsType.skill, name: skill.name, description: skill.description });
				}
				for (const file of instructions) {
					items.push({ uri: file.uri, type: PromptsType.instructions, name: file.name ?? basename(file.uri.path) });
				}
				for (const file of prompts) {
					items.push({ uri: file.uri, type: PromptsType.prompt, name: file.name ?? basename(file.uri.path) });
				}
				for (const file of hooks) {
					items.push({ uri: file.uri, type: PromptsType.hook, name: file.name ?? basename(file.uri.path) });
				}

				return items;
			},
		};

		super(
			[{ ...createCliHarnessDescriptor(getCliUserRoots(userHome), extras), itemProvider }],
			CustomizationHarness.CLI,
		);

		this._register(emitter);
		this._register(Event.any(
			promptsService.onDidChangeCustomAgents,
			promptsService.onDidChangeSlashCommands,
			promptsService.onDidChangeSkills,
			promptsService.onDidChangeHooks,
			promptsService.onDidChangeInstructions,
		)(() => emitter.fire()));
	}
}
