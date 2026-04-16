/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatCustomAgent, ChatHook, ChatInstruction, ChatPlugin, ChatSkill } from 'vscode';
import * as vscode from 'vscode';
import { raceCancellationError } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { PromptFileParser } from '../../../util/vs/workbench/contrib/chat/common/promptSyntax/promptFileParser';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { IPromptsService, ParsedPromptFile } from '../common/promptsService';

export class PromptsServiceImpl extends Disposable implements IPromptsService {
	declare _serviceBrand: undefined;

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


	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileService: IFileSystemService,
	) {
		super();

		this._register(vscode.chat.onDidChangeCustomAgents(() => this._onDidChangeCustomAgents.fire()));
		this._register(vscode.chat.onDidChangeInstructions(() => this._onDidChangeInstructions.fire()));
		this._register(vscode.chat.onDidChangeSkills(() => this._onDidChangeSkills.fire()));
		this._register(vscode.chat.onDidChangeHooks(() => this._onDidChangeHooks.fire()));
		this._register(vscode.chat.onDidChangePlugins(() => this._onDidChangePlugins.fire()));
	}

	getCustomAgents(token: CancellationToken): Promise<readonly ChatCustomAgent[]> {
		return Promise.resolve(vscode.chat.getCustomAgents(token));
	}

	getSlashCommands(token: CancellationToken): Promise<readonly ParsedPromptFile[]> {
		return Promise.resolve(vscode.chat.getSlashCommands(token));
	}

	getInstructions(token: CancellationToken): Promise<readonly ChatInstruction[]> {
		return Promise.resolve(vscode.chat.getInstructions(token));
	}

	getSkills(token: CancellationToken): Promise<readonly ChatSkill[]> {
		return Promise.resolve(vscode.chat.getSkills(token));
	}

	getHooks(token: CancellationToken): Promise<readonly ChatHook[]> {
		return Promise.resolve(vscode.chat.getHooks(token));
	}

	getPlugins(token: CancellationToken): Promise<readonly ChatPlugin[]> {
		return Promise.resolve(vscode.chat.getPlugins(token));
	}

	public async parseFile(uri: URI, token: CancellationToken): Promise<ParsedPromptFile> {
		// a temporary workaround to avoid creating a text document to read the file content, which triggers the validation of the file in core (fixed in 1.114)
		const getTextContent = async (uri: URI) => {
			const existingDoc = this.workspaceService.textDocuments.find(doc => extUriBiasedIgnorePathCase.isEqual(doc.uri, uri));
			if (!existingDoc) {
				// if the document is not already open in the workspace, check if the file exists on disk before trying to open it, to avoid triggering unwanted "file not found" errors from the text document service
				const bytes = await this.fileService.readFile(uri);
				return new TextDecoder().decode(bytes);
			} else {
				return existingDoc.getText();
			}
		};
		const text = await raceCancellationError(getTextContent(uri), token);
		return new PromptFileParser().parse(uri, text);
	}

}
