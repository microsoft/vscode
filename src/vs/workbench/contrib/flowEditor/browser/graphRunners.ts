/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from 'vs/base/common/assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ChatMessageRole, ILanguageModelsService } from 'vs/workbench/contrib/chat/common/languageModels';
import * as G from 'vs/workbench/contrib/flowEditor/common/flowEditorTypes';
import { IFlowGraph } from 'vs/workbench/contrib/flowEditor/common/flowGraphService';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';

export interface IGraphNodeCtx {
	store: DisposableStore;
	accessor: ServicesAccessor;
	flowGraph: IFlowGraph;
	input: any[];
	token: CancellationToken;
	onOutput: (...output: any[]) => void;
}

export const runGraphNode = (
	node: G.FlowNode,
	ctx: IGraphNodeCtx,
) => {
	switch (node.kind) {
		case G.NodeKind.Command:
			return runCommandNode(ctx, node);
		case G.NodeKind.OwnedCommand:
			return runCustomCommandNode(ctx, node);

		case G.NodeKind.Prompt:
			return runPromptNode(ctx, node);
		case G.NodeKind.Regex:
			return runRegexNode(ctx, node);
		case G.NodeKind.Condition:
			throw new Error('not implemented');
		case G.NodeKind.SpawnProcess:
			return runSpawnProcessNode(ctx, node);
		case G.NodeKind.Value:
			return runValueNode(ctx, node);
		case G.NodeKind.Fetch:
			return runFetchNode(ctx, node);

		case G.NodeKind.RunCommand:
			return runCommandActionNode(ctx, node);
		case G.NodeKind.Notify:
			return runNotifyNode(ctx, node);
		case G.NodeKind.ExtractJson:
			return runExtractJson(ctx, node);
		case G.NodeKind.StartChat:
			return runStartChat(ctx, node);

		default:
			assertNever(node);
	}
};

const runNotifyNode = ({ accessor, input }: IGraphNodeCtx, node: G.INotifyAction) => {
	const notificationService = accessor.get(INotificationService);
	const i = input[0];
	notificationService.info(i && typeof i === 'object' ? JSON.stringify(i) : String(i));
};

const runCommandActionNode = ({ accessor, input }: IGraphNodeCtx, node: G.ICommandAction) => {
	accessor.get(ICommandService).executeCommand(input[0], ...input.slice(1));
};

const runRegexNode = ({ onOutput, input }: IGraphNodeCtx, node: G.IRegexFilter) => {
	const re = new RegExp(node.re);
	const match = re.exec(input[0]);
	if (match) {
		onOutput(...match);
	}
};

const runValueNode = async ({ onOutput, input, accessor, flowGraph }: IGraphNodeCtx, node: G.IValueFilter) => {
	let value = node.value;
	for (let i = 0; i < input.length; i++) {
		const regex = new RegExp(`\\{${i}\\}`, 'g');
		value = value.replace(regex, String(input[i]));
	}


	const configResolver = accessor.get(IConfigurationResolverService);
	const workspaceFolder = accessor.get(IWorkspaceContextService).getWorkspaceFolder(flowGraph.fileUri) || undefined;

	onOutput(await configResolver.resolveAsync(workspaceFolder, value));
};

const runPromptNode = async ({ store, accessor, onOutput, input, token }: IGraphNodeCtx, node: G.IPromptFilter) => {
	const lmService = accessor.get(ILanguageModelsService);
	for (const model of lmService.getLanguageModelIds()) {
		const meta = lmService.lookupLanguageModel(model);
		if (node.family && meta?.family !== node.family) {
			continue;
		}

		// take a message like "hello {1}" and use a regex to replace all {n} with the inputs:
		let prompt = node.prompt;
		for (let i = 0; i < input.length; i++) {
			const regex = new RegExp(`{${i + 1}}`, 'g');
			prompt = prompt.replace(regex, String(input[i]));
		}


		let content = '';
		await lmService.makeLanguageModelChatRequest(
			model,
			new ExtensionIdentifier('vscode.flow'),
			[{ role: ChatMessageRole.User, content: { type: 'text', value: prompt } }],
			{},
			{
				report(f) {
					if (f.part.type === 'text') {
						content += f.part.value;
					}
				}
			},
			token
		);
		onOutput(content);
		return;
	}


	onOutput(`No language model found for family: ${node.family || 'any'}`);
};

const runCommandNode = ({ store, accessor, onOutput }: IGraphNodeCtx, node: G.ICommandTrigger) => {
	store.add(accessor.get(ICommandService).onDidExecuteCommand(async e => {
		if (e.commandId === node.command) {
			onOutput(await e.result);
		}
	}));
};

const runCustomCommandNode = ({ store, accessor, onOutput }: IGraphNodeCtx, node: G.IOwnedCommandTrigger) => {
	store.add(CommandsRegistry.registerCommand({
		id: node.command,
		handler: async (...args) => {
			onOutput(...args);
		},
	}));

	store.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
		command: {
			id: node.command,
			title: node.label,
		},
	}));
};

const runSpawnProcessNode = async ({ accessor, onOutput, input }: IGraphNodeCtx, node: G.ISpawnProcessFilter) => {
	const [command, cwd] = input;
	const { stdout, stderr } = await accessor.get(ICommandService).executeCommand('debug-auto-launch.hacky-run-command', cwd, command);
	onOutput(stdout.trimEnd(), stderr.trimEnd());
};

const runFetchNode = async ({ accessor, onOutput, input }: IGraphNodeCtx, node: G.IFetchURLFilter) => {
	const [url] = input;
	const response = await fetch(String(url));
	const text = await response.text();
	onOutput(text);
};

const runExtractJson = ({ onOutput, input }: IGraphNodeCtx, node: G.IExtractJsonFilter) => {
	const [data] = input;
	try {
		const json = JSON.parse(String(data));
		const value = dotNotationLookup(json, node.path);
		onOutput(value);
	} catch (e) {
		onOutput(`Error: ${e}\n\nInput:${data}`);
	}
};

const runStartChat = async ({ accessor, input }: IGraphNodeCtx, node: G.IStartChatAction) => {
	await accessor.get(ICommandService).executeCommand('workbench.action.chat.open', { query: input[0] });
};

function dotNotationLookup(object: any, query: string) {
	const parts = query.split('.');
	let value = object;
	for (const part of parts) {
		value = value && value[part];
	}
	return value;
}
