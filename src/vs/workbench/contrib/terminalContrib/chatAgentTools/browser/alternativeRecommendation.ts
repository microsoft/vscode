/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ILanguageModelToolsService } from '../../../chat/common/languageModelToolsService.js';

export interface ICommandReRoutingResult {
	shouldReRoute: boolean;
	alternativeRecommendation?: string;
	targetFiles?: string[];
	commandType?: 'file-read' | 'directory-create' | 'file-write' | 'file-list';
}

export interface IFileOperationHeuristics {
	extractFilePaths(commandLine: string): string[];
	detectCommandType(commandLine: string): 'file-read' | 'directory-create' | 'file-write' | 'file-list' | 'unknown';
}

let previouslyRecommededInSession = false;

const terminalCommands: { commands: RegExp[]; tags: string[]; description?: string }[] = [
	{
		commands: [
			new RegExp(/^python3? -m pip install(\b)/),
			new RegExp(/^pip3? install(\b)/),
		],
		tags: ['python environment'],
	},
	{
		commands: [
			new RegExp(/^python3? -m jupyter(\b)/),
			new RegExp(/^python3? -m pip install\b.*jupyter\b.*/),
			new RegExp(/^pip3? install\b.*jupyter\b.*/),
			new RegExp(/^jupyter(\b)/), // jupyter lab, jupyer notebook, jupyter nbconvert, etc.
		],
		tags: ['python environment', 'jupyter environment'],
	},
	{
		commands: [
			new RegExp(/^cat\s+[^|>&<]+$/), // cat <file> - simple file reading without pipes/redirects
			new RegExp(/^type\s+[^|>&<]+$/), // Windows equivalent of cat
		],
		tags: ['file read', 'file operations'],
		description: 'Reading file contents can be handled more efficiently by native file tools'
	},
	{
		commands: [
			new RegExp(/^mkdir\s+/), // mkdir command
			new RegExp(/^md\s+/), // Windows mkdir equivalent
		],
		tags: ['directory creation', 'file operations'],
		description: 'Directory creation can be handled by native file management tools'
	}
];

export function getRecommendedToolsOverRunInTerminal(commandLine: string, languageModelToolsService: ILanguageModelToolsService): string | undefined {
	const tools = languageModelToolsService.getTools();
	if (!tools || previouslyRecommededInSession) {
		return;
	}

	const recommendedTools = new Set<string>();
	const messages: string[] = [
		`The terminal command '${commandLine}' was not executed.`,
		`Try using some of the following tools instead of running a Terminal Command (if unable to use one of these tools as an alternative then run the same terminal command again):`,
	];
	for (const terminalCommand of terminalCommands) {
		if (!terminalCommand.commands.some((condition) => condition.test(commandLine))) {
			continue;
		}
		const tagsToSearchFor = terminalCommand.tags;
		Array.from(tools)
			.filter(t => tagsToSearchFor.some(tag => t.tags?.includes(tag)))
			.forEach(tool => {
				recommendedTools.add(tool.id);
			});

	}
	recommendedTools.forEach(toolName => {
		messages.push(`- ${toolName}`);
	});

	if (recommendedTools.size) {
		previouslyRecommededInSession = true;
		return messages.join('  \n');
	}

	return undefined;
}

/**
 * Implements heuristics for detecting file operations and extracting file paths from commands
 */
export class FileOperationHeuristics implements IFileOperationHeuristics {
	
	extractFilePaths(commandLine: string): string[] {
		const paths: string[] = [];
		
		// Handle cat/type commands: cat file1 file2
		const catMatch = commandLine.match(/^(?:cat|type)\s+(.+)$/);
		if (catMatch) {
			// Split by spaces but handle quoted paths
			const pathsStr = catMatch[1];
			const pathMatches = pathsStr.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
			paths.push(...pathMatches.map(p => p.replace(/^"(.*)"$/, '$1')));
		}
		
		// Handle mkdir commands: mkdir dir1 dir2 or mkdir -p dir1/subdir
		const mkdirMatch = commandLine.match(/^(?:mkdir|md)\s+(?:-[p]\s+)?(.+)$/);
		if (mkdirMatch) {
			const pathsStr = mkdirMatch[1];
			const pathMatches = pathsStr.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
			paths.push(...pathMatches.map(p => p.replace(/^"(.*)"$/, '$1')));
		}
		
		// Handle ls commands: ls file/dir
		const lsMatch = commandLine.match(/^(?:ls|dir)\s+(.+)$/);
		if (lsMatch) {
			const pathsStr = lsMatch[1];
			const pathMatches = pathsStr.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
			paths.push(...pathMatches.map(p => p.replace(/^"(.*)"$/, '$1')));
		}
		
		return paths;
	}
	
	detectCommandType(commandLine: string): 'file-read' | 'directory-create' | 'file-write' | 'file-list' | 'unknown' {
		const trimmed = commandLine.trim();
		
		if (/^(?:cat|type)\s+/.test(trimmed)) {
			return 'file-read';
		}
		
		if (/^(?:mkdir|md)\s+/.test(trimmed)) {
			return 'directory-create';
		}
		
		if (/^(?:ls|dir)\s+/.test(trimmed)) {
			return 'file-list';
		}
		
		if (/^(?:echo|printf)\s+.*>\s*/.test(trimmed)) {
			return 'file-write';
		}
		
		return 'unknown';
	}
}

/**
 * Enhanced function to check for command re-routing with file operation detection
 */
export function getCommandReRoutingRecommendation(commandLine: string, languageModelToolsService: ILanguageModelToolsService): ICommandReRoutingResult {
	const heuristics = new FileOperationHeuristics();
	const commandType = heuristics.detectCommandType(commandLine);
	const targetFiles = heuristics.extractFilePaths(commandLine);
	
	// Check if this is a file operation that could be re-routed
	if (commandType !== 'unknown') {
		const tools = languageModelToolsService.getTools();
		if (tools) {
			const fileOperationTags = ['file read', 'file operations', 'directory creation'];
			const availableTools = Array.from(tools).filter(t => 
				fileOperationTags.some(tag => t.tags?.includes(tag))
			);
			
			if (availableTools.length > 0) {
				const alternativeRecommendation = getRecommendedToolsOverRunInTerminal(commandLine, languageModelToolsService);
				return {
					shouldReRoute: true,
					alternativeRecommendation,
					targetFiles,
					commandType
				};
			}
		}
	}
	
	// Fall back to existing behavior for non-file operations
	const alternativeRecommendation = getRecommendedToolsOverRunInTerminal(commandLine, languageModelToolsService);
	return {
		shouldReRoute: !!alternativeRecommendation,
		alternativeRecommendation,
		targetFiles,
		commandType: commandType === 'unknown' ? undefined : commandType
	};
}

/**
 * Post-execution analysis: Track file changes and suggest better tools for future similar operations
 * This implements the "run the terminal command and track any files changed" approach
 */
export function analyzeCommandExecutionForFileChanges(
	commandLine: string, 
	outputText: string,
	workingDirectory?: string
): {
	detectedFileChanges: string[];
	suggestedAlternatives: string[];
	confidence: 'high' | 'medium' | 'low';
} {
	const heuristics = new FileOperationHeuristics();
	const detectedFileChanges: string[] = [];
	const suggestedAlternatives: string[] = [];
	
	// Extract file paths mentioned in the original command
	const originalTargetFiles = heuristics.extractFilePaths(commandLine);
	
	// Use regex heuristics to detect file changes from command output
	// Common patterns for successful file operations:
	
	// Directory creation patterns
	const dirCreatedPatterns = [
		/(?:mkdir|created directory|Directory created).*?([^\s\n]+)/gi,
		/created?\s+(?:directory|folder|dir)\s+['"']?([^'"\s\n]+)['"']?/gi
	];
	
	// File read patterns (files that were successfully read)
	const fileReadPatterns = [
		// Look for file paths that appear in the command and aren't error messages
		...originalTargetFiles.map(file => new RegExp(`(?<!cannot|failed|error|not found).*${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))
	];
	
	// File write patterns
	const fileWritePatterns = [
		/(?:wrote|written|saved|created).*?([^\s\n]+)/gi,
		/([^\s\n]+)\s+(?:bytes?|lines?)\s+written/gi
	];
	
	// Check directory creation
	for (const pattern of dirCreatedPatterns) {
		let match;
		while ((match = pattern.exec(outputText)) !== null) {
			const filePath = match[1].trim();
			if (filePath && !detectedFileChanges.includes(filePath)) {
				detectedFileChanges.push(filePath);
				suggestedAlternatives.push('Use file explorer or directory creation tools for better integration');
			}
		}
	}
	
	// Check file operations
	for (const pattern of fileWritePatterns) {
		let match;
		while ((match = pattern.exec(outputText)) !== null) {
			const filePath = match[1].trim();
			if (filePath && !detectedFileChanges.includes(filePath)) {
				detectedFileChanges.push(filePath);
				suggestedAlternatives.push('Use file editing tools for better integration with VS Code');
			}
		}
	}
	
	// For file read operations, if command succeeded without errors, assume target files were read
	const commandType = heuristics.detectCommandType(commandLine);
	if (commandType === 'file-read' && !outputText.includes('No such file') && !outputText.includes('cannot read')) {
		detectedFileChanges.push(...originalTargetFiles);
		suggestedAlternatives.push('Use file viewing tools or open files directly in VS Code for better experience');
	}
	
	// Determine confidence based on detection quality
	let confidence: 'high' | 'medium' | 'low' = 'low';
	if (detectedFileChanges.length > 0) {
		if (detectedFileChanges.some(file => originalTargetFiles.includes(file))) {
			confidence = 'high'; // Files match what we expected from the command
		} else if (detectedFileChanges.length > 0) {
			confidence = 'medium'; // We detected some file changes
		}
	}
	
	return {
		detectedFileChanges,
		suggestedAlternatives: Array.from(new Set(suggestedAlternatives)),
		confidence
	};
}
