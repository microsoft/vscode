/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ICompletionResource } from '../types';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';
import { execHelper } from './common';

export async function getPwshGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	return [
		...await getAliases(options, existingCommands),
		...await getCommands(options, existingCommands),
	];
}

/**
 * The numeric values associated with CommandType from Get-Command. It appears that this is a
 * bitfield based on the values but I think it's actually used as an enum where a CommandType can
 * only be a single one of these.
 *
 * Source:
 *
 * ```
 * [enum]::GetValues([System.Management.Automation.CommandTypes]) | ForEach-Object {
 *     [pscustomobject]@{
 *         Name  = $_
 *         Value = [int]$_
 *     }
 * }
 * ```
 */
const enum PwshCommandType {
	Alias = 1,
	Function = 2,
	Filter = 4,
	Cmdlet = 8,
	ExternalScript = 16,
	Application = 32,
	Script = 64,
	Configuration = 256,
	// All = 383,
}

const pwshCommandTypeToCompletionKind: Map<PwshCommandType, vscode.TerminalCompletionItemKind> = new Map([
	[PwshCommandType.Alias, vscode.TerminalCompletionItemKind.Alias],
	[PwshCommandType.Function, vscode.TerminalCompletionItemKind.Method],
	[PwshCommandType.Filter, vscode.TerminalCompletionItemKind.Method],
	[PwshCommandType.Cmdlet, vscode.TerminalCompletionItemKind.Method],
	[PwshCommandType.ExternalScript, vscode.TerminalCompletionItemKind.Method],
	[PwshCommandType.Application, vscode.TerminalCompletionItemKind.Method],
	[PwshCommandType.Script, vscode.TerminalCompletionItemKind.Method],
	[PwshCommandType.Configuration, vscode.TerminalCompletionItemKind.Argument],
]);

async function getAliases(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<ICompletionResource[]> {
	const output = await execHelper('Get-Command -CommandType Alias | Select-Object Name, CommandType, Definition, DisplayName, ModuleName, @{Name="Version";Expression={$_.Version.ToString()}} | ConvertTo-Json', {
		...options,
		maxBuffer: 1024 * 1024 * 100 // This is a lot of content, increase buffer size
	});
	let json: any;
	try {
		json = JSON.parse(output);
	} catch (e) {
		console.error('Error parsing output:', e);
		return [];
	}
	return (json as any[]).map(e => {
		// Aliases sometimes use the same Name and DisplayName, show them as methods in this case.
		const isAlias = e.Name !== e.DisplayName;
		const detailParts: string[] = [];
		if (e.Definition) {
			detailParts.push(e.Definition);
		}
		if (e.ModuleName && e.Version) {
			detailParts.push(`${e.ModuleName} v${e.Version}`);
		}
		let definitionCommand = undefined;
		if (e.Definition) {
			let definitionIndex = e.Definition.indexOf(' ');
			if (definitionIndex === -1) {
				definitionIndex = e.Definition.length;
				definitionCommand = e.Definition.substring(0, definitionIndex);
			}
		}
		return {
			label: e.Name,
			detail: detailParts.join('\n\n'),
			kind: (isAlias
				? vscode.TerminalCompletionItemKind.Alias
				: vscode.TerminalCompletionItemKind.Method),
			definitionCommand,
		};
	});
}

async function getCommands(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<ICompletionResource[]> {
	const output = await execHelper('Get-Command -All | Select-Object Name, CommandType, Definition, ModuleName, @{Name="Version";Expression={$_.Version.ToString()}} | ConvertTo-Json', {
		...options,
		maxBuffer: 1024 * 1024 * 100 // This is a lot of content, increase buffer size
	});
	let json: any;
	try {
		json = JSON.parse(output);
	} catch (e) {
		console.error('Error parsing pwsh output:', e);
		return [];
	}
	return (
		(json as any[])
			.filter(e => e.CommandType !== PwshCommandType.Alias)
			.map(e => {
				const detailParts: string[] = [];
				if (e.Definition) {
					detailParts.push(e.Definition.trim());
				}
				if (e.ModuleName && e.Version) {
					detailParts.push(`${e.ModuleName} v${e.Version}`);
				}
				return {
					label: e.Name,
					detail: detailParts.join('\n\n'),
					kind: pwshCommandTypeToCompletionKind.get(e.CommandType)
				};
			})
	);
}
