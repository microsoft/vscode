/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { ParsedPromptFile } from '../../common/promptSyntax/promptFileParser.js';
import { ICustomAgent, IPromptPath, IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { ResourceSet } from '../../../../../base/common/map.js';

export class MockPromptsService implements IPromptsService {

	_serviceBrand: undefined;

	private readonly _onDidChangeCustomChatModes = new Emitter<void>();
	readonly onDidChangeCustomAgents = this._onDidChangeCustomChatModes.event;

	private _customModes: ICustomAgent[] = [];

	setCustomModes(modes: ICustomAgent[]): void {
		this._customModes = modes;
		this._onDidChangeCustomChatModes.fire();
	}

	async getCustomAgents(token: CancellationToken): Promise<readonly ICustomAgent[]> {
		return this._customModes;
	}

	// Stub implementations for required interface methods
	getSyntaxParserFor(_model: any): any { throw new Error('Not implemented'); }
	listPromptFiles(_type: any): Promise<readonly any[]> { throw new Error('Not implemented'); }
	listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage, token: CancellationToken): Promise<readonly IPromptPath[]> { throw new Error('Not implemented'); }
	getSourceFolders(_type: any): readonly any[] { throw new Error('Not implemented'); }
	asPromptSlashCommand(_command: string): any { return undefined; }
	resolvePromptSlashCommand(_data: any, _token: CancellationToken): Promise<any> { throw new Error('Not implemented'); }
	resolvePromptSlashCommandFromCache(command: string): ParsedPromptFile | undefined { throw new Error('Not implemented'); }
	get onDidChangeParsedPromptFilesCache(): Event<void> { throw new Error('Not implemented'); }
	findPromptSlashCommands(): Promise<any[]> { throw new Error('Not implemented'); }
	getPromptCommandName(uri: URI): Promise<string> { throw new Error('Not implemented'); }
	parse(_uri: URI, _type: any, _token: CancellationToken): Promise<any> { throw new Error('Not implemented'); }
	parseNew(_uri: URI, _token: CancellationToken): Promise<any> { throw new Error('Not implemented'); }
	getPromptFileType(_resource: URI): any { return undefined; }
	getParsedPromptFile(textModel: ITextModel): ParsedPromptFile { throw new Error('Not implemented'); }
	registerContributedFile(type: PromptsType, name: string, description: string, uri: URI, extension: IExtensionDescription): IDisposable { throw new Error('Not implemented'); }
	getPromptLocationLabel(promptPath: IPromptPath): string { throw new Error('Not implemented'); }
	findAgentMDsInWorkspace(token: CancellationToken): Promise<URI[]> { throw new Error('Not implemented'); }
	listAgentMDs(token: CancellationToken): Promise<URI[]> { throw new Error('Not implemented'); }
	listCopilotInstructionsMDs(token: CancellationToken): Promise<URI[]> { throw new Error('Not implemented'); }
	getAgentFileURIFromModeFile(oldURI: URI): URI | undefined { throw new Error('Not implemented'); }
	getDisabledPromptFiles(type: PromptsType): ResourceSet { throw new Error('Method not implemented.'); }
	setDisabledPromptFiles(type: PromptsType, uris: ResourceSet): void { throw new Error('Method not implemented.'); }
	dispose(): void { }
}
