/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatCustomAgent, ChatHook, ChatInstruction, ChatPlugin, ChatSkill, ChatSlashCommand } from 'vscode';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { PromptFileParser } from '../../../../util/vs/workbench/contrib/chat/common/promptSyntax/promptFileParser';
import { IPromptsService, IAgentInstructionFile, ParsedPromptFile } from '../../common/promptsService';
import { ResourceMap } from '../../../../util/vs/base/common/map';

export class MockPromptsService extends Disposable implements IPromptsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;

	private readonly _onDidChangeInstructions = this._register(new Emitter<void>());
	readonly onDidChangeInstructions: Event<void> = this._onDidChangeInstructions.event;

	private readonly _onDidChangeSkills = this._register(new Emitter<void>());
	readonly onDidChangeSkills: Event<void> = this._onDidChangeSkills.event;

	private readonly _onDidChangeHooks = this._register(new Emitter<void>());
	readonly onDidChangeHooks: Event<void> = this._onDidChangeHooks.event;

	private readonly _onDidChangePlugins = this._register(new Emitter<void>());
	readonly onDidChangePlugins: Event<void> = this._onDidChangePlugins.event;

	private _customAgents: readonly ChatCustomAgent[] = [];
	private _slashCommands: readonly ChatSlashCommand[] = [];
	private _instructions: readonly ChatInstruction[] = [];
	private _skills: readonly ChatSkill[] = [];
	private _hooks: readonly ChatHook[] = [];
	private _plugins: readonly ChatPlugin[] = [];
	private _fileContents = new ResourceMap<string>();

	setCustomAgents(agents: readonly ChatCustomAgent[]): void {
		this._customAgents = agents;
		this._onDidChangeCustomAgents.fire();
	}

	fireCustomAgentsChanged(): void {
		this._onDidChangeCustomAgents.fire();
	}

	setSlashCommands(commands: readonly ChatSlashCommand[]): void {
		this._slashCommands = commands;
	}

	setInstructions(instructions: readonly ChatInstruction[]): void {
		this._instructions = instructions;
		this._onDidChangeInstructions.fire();
	}

	fireInstructionsChanged(): void {
		this._onDidChangeInstructions.fire();
	}

	setSkills(skills: readonly ChatSkill[]): void {
		this._skills = skills;
		this._onDidChangeSkills.fire();
	}

	fireSkillsChanged(): void {
		this._onDidChangeSkills.fire();
	}

	setHooks(hooks: readonly ChatHook[]): void {
		this._hooks = hooks;
		this._onDidChangeHooks.fire();
	}

	firePluginsChanged(): void {
		this._onDidChangePlugins.fire();
	}

	setPlugins(plugins: readonly ChatPlugin[]): void {
		this._plugins = plugins;
		this._onDidChangePlugins.fire();
	}

	getCustomAgents(_token: CancellationToken): Promise<readonly ChatCustomAgent[]> {
		return Promise.resolve(this._customAgents);
	}

	getSlashCommands(_token: CancellationToken): Promise<readonly ChatSlashCommand[]> {
		return Promise.resolve(this._slashCommands);
	}

	getInstructions(_token: CancellationToken): Promise<readonly ChatInstruction[]> {
		return Promise.resolve(this._instructions);
	}

	getSkills(_token: CancellationToken): Promise<readonly ChatSkill[]> {
		return Promise.resolve(this._skills);
	}

	getHooks(_token: CancellationToken): Promise<readonly ChatHook[]> {
		return Promise.resolve(this._hooks);
	}

	fireHooksChanged(): void {
		this._onDidChangeHooks.fire();
	}

	getPlugins(_token: CancellationToken): Promise<readonly ChatPlugin[]> {
		return Promise.resolve(this._plugins);
	}

	private _agentInstructions: readonly IAgentInstructionFile[] = [];
	private _nestedAgentMDs: readonly IAgentInstructionFile[] = [];

	setAgentInstructions(files: readonly IAgentInstructionFile[]): void {
		this._agentInstructions = files;
	}

	setNestedAgentMDs(files: readonly IAgentInstructionFile[]): void {
		this._nestedAgentMDs = files;
	}

	listAgentInstructions(_token: CancellationToken): Promise<IAgentInstructionFile[]> {
		return Promise.resolve([...this._agentInstructions]);
	}

	listNestedAgentMDs(_token: CancellationToken): Promise<IAgentInstructionFile[]> {
		return Promise.resolve([...this._nestedAgentMDs]);
	}

	/** Register content so parseFile returns a parsed result for the given URI. */
	setFileContent(uri: URI, content: string) {
		this._fileContents.set(uri, content);
	}

	parseFile(uri: URI, _token: CancellationToken): Promise<ParsedPromptFile> {
		const content = this._fileContents.get(uri) ?? '';
		return Promise.resolve(new PromptFileParser().parse(uri, content));
	}
}
