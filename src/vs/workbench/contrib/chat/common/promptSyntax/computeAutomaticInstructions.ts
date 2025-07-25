/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { match, splitGlobAware } from '../../../../../base/common/glob.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ChatRequestVariableSet, IChatRequestVariableEntry, IPromptFileVariableEntry, isPromptFileVariableEntry, toPromptFileVariableEntry, toPromptTextVariableEntry, PromptFileVariableKind } from '../chatVariableEntries.js';
import { IToolData } from '../languageModelToolsService.js';
import { PromptsConfig } from './config/config.js';
import { COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, isPromptOrInstructionsFile } from './config/promptFileLocations.js';
import { PromptsType } from './promptTypes.js';
import { IPromptParserResult, IPromptPath, IPromptsService } from './service/promptsService.js';

export class ComputeAutomaticInstructions {

	private _parseResults: ResourceMap<IPromptParserResult> = new ResourceMap();

	private _autoAddedInstructions: IPromptFileVariableEntry[] = [];

	constructor(
		private readonly _readFileTool: IToolData | undefined,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@ILogService public readonly _logService: ILogService,
		@ILabelService private readonly _labelService: ILabelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
	) {
	}

	get autoAddedInstructions(): readonly IPromptFileVariableEntry[] {
		return this._autoAddedInstructions;
	}

	private async _parseInstructionsFile(uri: URI, token: CancellationToken): Promise<IPromptParserResult> {
		if (this._parseResults.has(uri)) {
			return this._parseResults.get(uri)!;
		}
		const result = await this._promptsService.parse(uri, PromptsType.instructions, token);
		this._parseResults.set(uri, result);
		return result;
	}

	public async collect(variables: ChatRequestVariableSet, token: CancellationToken): Promise<void> {
		const instructionFiles = await this._promptsService.listPromptFiles(PromptsType.instructions, token);

		this._logService.trace(`[InstructionsContextComputer] ${instructionFiles.length} instruction files available.`);

		// find instructions where the `applyTo` matches the attached context

		const context = this._getContext(variables);
		const autoAddedInstructions = await this.findInstructionFilesFor(instructionFiles, context, token);

		variables.add(...autoAddedInstructions);
		this._autoAddedInstructions.push(...autoAddedInstructions);

		// get copilot instructions
		const copilotInstructions = await this._getCopilotInstructions();
		for (const entry of copilotInstructions) {
			variables.add(entry);
		}
		this._logService.trace(`[InstructionsContextComputer]  ${copilotInstructions.length} Copilot instructions files added.`);
		const instructionsWithPatternsList = await this._getInstructionsWithPatternsList(instructionFiles, variables, token);
		if (instructionsWithPatternsList.length > 0) {
			const text = instructionsWithPatternsList.join('\n');
			variables.add(toPromptTextVariableEntry(text, PromptsConfig.COPILOT_INSTRUCTIONS, true));
		}
		// add all instructions for all instruction files that are in the context
		await this._addReferencedInstructions(variables, token);

	}

	public async collectCopilotInstructionsOnly(variables: ChatRequestVariableSet, token: CancellationToken): Promise<void> {
		const copilotInstructions = await this._getCopilotInstructions();
		for (const entry of copilotInstructions) {
			variables.add(entry);
		}
		this._logService.trace(`[InstructionsContextComputer]  ${copilotInstructions.length} Copilot instructions files added.`);
		// add all instructions for all instruction files that are in the context
		await this._addReferencedInstructions(variables, token);
		return;
	}

	/** public for testing */
	public async findInstructionFilesFor(instructionFiles: readonly IPromptPath[], context: { files: ResourceSet; instructions: ResourceSet }, token: CancellationToken): Promise<IPromptFileVariableEntry[]> {

		const autoAddedInstructions: IPromptFileVariableEntry[] = [];
		for (const instructionFile of instructionFiles) {
			const { metadata, uri } = await this._parseInstructionsFile(instructionFile.uri, token);

			if (metadata?.promptType !== PromptsType.instructions) {
				this._logService.trace(`[InstructionsContextComputer] Not an instruction file: ${uri}`);
				continue;
			}
			const applyTo = metadata?.applyTo;

			if (!applyTo) {
				this._logService.trace(`[InstructionsContextComputer] No 'applyTo' found: ${uri}`);
				continue;
			}

			if (context.instructions.has(uri)) {
				// the instruction file is already part of the input or has already been processed
				this._logService.trace(`[InstructionsContextComputer] Skipping already processed instruction file: ${uri}`);
				continue;
			}

			const match = this._matches(context.files, applyTo);
			if (match) {
				this._logService.trace(`[InstructionsContextComputer] Match for ${uri} with ${match.pattern}${match.file ? ` for file ${match.file}` : ''}`);

				const reason = !match.file ?
					localize('instruction.file.reason.allFiles', 'Automatically attached as pattern is **') :
					localize('instruction.file.reason.specificFile', 'Automatically attached as pattern {0} matches {1}', applyTo, this._labelService.getUriLabel(match.file, { relative: true }));


				autoAddedInstructions.push(toPromptFileVariableEntry(uri, PromptFileVariableKind.Instruction, reason, true));
			} else {
				this._logService.trace(`[InstructionsContextComputer] No match for ${uri} with ${applyTo}`);
			}
		}
		return autoAddedInstructions;
	}

	private _getContext(attachedContext: ChatRequestVariableSet): { files: ResourceSet; instructions: ResourceSet } {
		const files = new ResourceSet();
		const instructions = new ResourceSet();
		for (const variable of attachedContext.asArray()) {
			if (isPromptFileVariableEntry(variable)) {
				instructions.add(variable.value);
			} else {
				const uri = IChatRequestVariableEntry.toUri(variable);
				if (uri) {
					files.add(uri);
				}
			}
		}

		return { files, instructions };
	}

	private async _getCopilotInstructions(): Promise<IPromptFileVariableEntry[]> {
		const useCopilotInstructionsFiles = this._configurationService.getValue(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES);
		if (!useCopilotInstructionsFiles) {
			return [];
		}
		const instructionFiles: string[] = [];
		instructionFiles.push(`.github/` + COPILOT_CUSTOM_INSTRUCTIONS_FILENAME);

		const { folders } = this._workspaceService.getWorkspace();
		const entries: IPromptFileVariableEntry[] = [];
		for (const folder of folders) {
			for (const instructionFilePath of instructionFiles) {
				const file = joinPath(folder.uri, instructionFilePath);
				if (await this._fileService.exists(file)) {
					entries.push(toPromptFileVariableEntry(file, PromptFileVariableKind.Instruction, localize('instruction.file.reason.copilot', 'Automatically attached as setting {0} is enabled', PromptsConfig.USE_COPILOT_INSTRUCTION_FILES), true));
				}
			}
		}
		return entries;
	}

	private _matches(files: ResourceSet, applyToPattern: string): { pattern: string; file?: URI } | undefined {
		const patterns = splitGlobAware(applyToPattern, ',');
		const patterMatches = (pattern: string): { pattern: string; file?: URI } | undefined => {
			pattern = pattern.trim();
			if (pattern.length === 0) {
				// if glob pattern is empty, skip it
				return undefined;
			}
			if (pattern === '**' || pattern === '**/*' || pattern === '*') {
				// if glob pattern is one of the special wildcard values,
				// add the instructions file event if no files are attached
				return { pattern };
			}
			if (!pattern.startsWith('/') && !pattern.startsWith('**/')) {
				// support relative glob patterns, e.g. `src/**/*.js`
				pattern = '**/' + pattern;
			}

			// match each attached file with each glob pattern and
			// add the instructions file if its rule matches the file
			for (const file of files) {
				// if the file is not a valid URI, skip it
				if (match(pattern, file.path)) {
					return { pattern, file }; // return the matched pattern and file URI
				}
			}
			return undefined;
		};
		for (const pattern of patterns) {
			const matchResult = patterMatches(pattern);
			if (matchResult) {
				return matchResult; // return the first matched pattern and file URI
			}
		}
		return undefined;
	}

	private async _getInstructionsWithPatternsList(instructionFiles: readonly IPromptPath[], _existingVariables: ChatRequestVariableSet, token: CancellationToken): Promise<string[]> {
		if (!this._readFileTool) {
			this._logService.trace('[InstructionsContextComputer] No readFile tool available, skipping instructions with patterns list.');
			return [];
		}

		const entries: string[] = [];
		for (const instructionFile of instructionFiles) {
			const { metadata, uri } = await this._parseInstructionsFile(instructionFile.uri, token);
			if (metadata?.promptType !== PromptsType.instructions) {
				continue;
			}
			const applyTo = metadata?.applyTo;
			const description = metadata?.description ?? '';
			if (applyTo && applyTo !== '**' && applyTo !== '**/*' && applyTo !== '*') {
				entries.push(`| ${metadata.applyTo} | '${getFilePath(uri)}' | ${description} |`);
			}
		}
		if (entries.length === 0) {
			return entries;
		}

		const toolName = 'read_file'; // workaround https://github.com/microsoft/vscode/issues/252167
		return [
			'Here is a list of instruction files that contain rules for modifying or creating new code.',
			'These files are important for ensuring that the code is modified or created correctly.',
			'Please make sure to follow the rules specified in these files when working with the codebase.',
			`If the file is not already available as attachment, use the \`${toolName}\` tool to acquire it.`,
			'Make sure to acquire the instructions before making any changes to the code.',
			'| Pattern | File Path | Description |',
			'| ------- | --------- | ----------- |',
		].concat(entries);
	}

	private async _addReferencedInstructions(attachedContext: ChatRequestVariableSet, token: CancellationToken): Promise<void> {
		const seen = new ResourceSet();
		const todo: URI[] = [];
		for (const variable of attachedContext.asArray()) {
			if (isPromptFileVariableEntry(variable)) {
				if (!seen.has(variable.value)) {
					todo.push(variable.value);
					seen.add(variable.value);
				}
			}
		}
		let next = todo.pop();
		while (next) {
			const result = await this._parseInstructionsFile(next, token);
			const refsToCheck: { resource: URI }[] = [];
			for (const ref of result.references) {
				if (!seen.has(ref) && (isPromptOrInstructionsFile(ref) || this._workspaceService.getWorkspaceFolder(ref) !== undefined)) {
					// only add references that are either prompt or instruction files or are part of the workspace
					refsToCheck.push({ resource: ref });
					seen.add(ref);
				}
			}
			if (refsToCheck.length > 0) {
				const stats = await this._fileService.resolveAll(refsToCheck);
				for (let i = 0; i < stats.length; i++) {
					const stat = stats[i];
					const uri = refsToCheck[i].resource;
					if (stat.success && stat.stat?.isFile) {
						if (isPromptOrInstructionsFile(uri)) {
							// only recursivly parse instruction files
							todo.push(uri);
						}
						const reason = localize('instruction.file.reason.referenced', 'Referenced by {0}', basename(next));
						attachedContext.add(toPromptFileVariableEntry(uri, PromptFileVariableKind.InstructionReference, reason, true));
					}
				}
			}
			next = todo.pop();
		}
	}
}


function getFilePath(uri: URI): string {
	if (uri.scheme === Schemas.file || uri.scheme === Schemas.vscodeRemote) {
		return uri.fsPath;
	}
	return uri.toString();
}
