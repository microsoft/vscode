/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Mutable } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { getCopilotGlobalMcpConfigurationError } from '../../../../platform/mcp/common/mcpCopilotGlobalConfiguration.js';
import { IMcpRemoteServerConfiguration, IMcpServerConfiguration, IMcpStdioServerConfiguration, McpServerType } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { getEditedMcpServerConfiguration } from '../../../../platform/mcp/common/mcpResourceScannerService.js';
import { getWorkspaceRootMcpConfigurationError, McpResourceFormat } from '../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';

/**
 * The server kinds offered by the configuration form. `Http` and `Sse` both
 * persist as {@link McpServerType.REMOTE}; `Sse` additionally pins `transport: 'sse'`.
 */
export const enum McpServerFormKind {
	Stdio = 'stdio',
	Http = 'http',
	Sse = 'sse',
}

export interface IMcpServerFormKeyValue {
	name: string;
	value: string;
}

/**
 * Editable, string-based representation of an MCP server configuration.
 */
export interface IMcpServerFormState {
	kind: McpServerFormKind;
	command: string;
	args: string;
	cwd: string;
	envFile: string;
	env: IMcpServerFormKeyValue[];
	url: string;
	headers: IMcpServerFormKeyValue[];
}

/**
 * Validation messages keyed by form field. A field without a message is valid.
 * `format` reports configuration the destination file cannot represent.
 */
export interface IMcpServerFormValidation {
	command?: string;
	args?: string;
	url?: string;
	env?: string;
	headers?: string;
	format?: string;
}

/**
 * The parts of a configuration that a file format can store. `.mcp.json` and the
 * Copilot CLI's `mcp-config.json` are shared with other clients and support less than `mcp.json`.
 */
export interface IMcpServerFormCapabilities {
	readonly kinds: readonly McpServerFormKind[];
	readonly envFile: boolean;
	readonly cwd: boolean;
	/** Whether VS Code `${input:...}` variables are resolved for this file. */
	readonly inputVariables: boolean;
}

export function getMcpServerFormCapabilities(format: McpResourceFormat): IMcpServerFormCapabilities {
	switch (format) {
		case McpResourceFormat.WorkspaceRoot:
			return { kinds: [McpServerFormKind.Stdio, McpServerFormKind.Http], envFile: false, cwd: false, inputVariables: false };
		case McpResourceFormat.CopilotGlobal:
			return { kinds: [McpServerFormKind.Stdio, McpServerFormKind.Http, McpServerFormKind.Sse], envFile: false, cwd: true, inputVariables: false };
		default:
			return { kinds: [McpServerFormKind.Stdio, McpServerFormKind.Http, McpServerFormKind.Sse], envFile: true, cwd: true, inputVariables: true };
	}
}

/**
 * Explains why changing {@link previous} to {@link config} cannot be saved to a file of the given
 * {@link format}, if it cannot. Only the edit is checked, so properties already in the file that
 * the format does not support never block saving.
 */
export function getMcpServerFormatError(name: string, previous: IMcpServerConfiguration, config: IMcpServerConfiguration, format: McpResourceFormat): string | undefined {
	const edited = getEditedMcpServerConfiguration(previous, config);
	switch (format) {
		case McpResourceFormat.WorkspaceRoot:
			return getWorkspaceRootMcpConfigurationError({ name, config: edited });
		case McpResourceFormat.CopilotGlobal:
			return getCopilotGlobalMcpConfigurationError({ name, config: edited });
		default:
			return undefined;
	}
}

export function toMcpServerFormState(config: IMcpServerConfiguration): IMcpServerFormState {
	const empty: IMcpServerFormState = { kind: McpServerFormKind.Stdio, command: '', args: '', cwd: '', envFile: '', env: [], url: '', headers: [] };
	if (config.type === McpServerType.LOCAL) {
		return {
			...empty,
			command: config.command ?? '',
			args: formatMcpServerArgs(config.args),
			cwd: config.cwd ?? '',
			envFile: config.envFile ?? '',
			env: Object.entries(config.env ?? {}).map(([name, value]) => ({ name, value: value === null ? '' : String(value) })),
		};
	}
	return {
		...empty,
		kind: config.transport === 'sse' ? McpServerFormKind.Sse : McpServerFormKind.Http,
		url: config.url ?? '',
		headers: Object.entries(config.headers ?? {}).map(([name, value]) => ({ name, value })),
	};
}

/**
 * Formats arguments as a space separated list, or as a JSON array when an
 * argument would not survive a round trip through {@link parseMcpServerArgs}.
 */
export function formatMcpServerArgs(args: readonly string[] | undefined): string {
	if (!args?.length) {
		return '';
	}
	if (args.some(arg => arg === '' || /\s/.test(arg)) || args[0].startsWith('[')) {
		return JSON.stringify(args);
	}
	return args.join(' ');
}

/**
 * Parses arguments entered as a space separated list or as a JSON array of strings.
 */
export function parseMcpServerArgs(value: string): { readonly args: string[]; readonly error?: string } {
	const trimmed = value.trim();
	if (!trimmed) {
		return { args: [] };
	}
	if (trimmed.startsWith('[')) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			return { args: [], error: localize('mcpForm.args.invalidJson', "Arguments must be a valid JSON array of strings.") };
		}
		if (!Array.isArray(parsed) || parsed.some(arg => typeof arg !== 'string')) {
			return { args: [], error: localize('mcpForm.args.invalidJson', "Arguments must be a valid JSON array of strings.") };
		}
		return { args: parsed };
	}
	return { args: trimmed.split(/\s+/) };
}

export function validateMcpServerFormState(state: IMcpServerFormState): IMcpServerFormValidation {
	const result: IMcpServerFormValidation = {};
	if (state.kind === McpServerFormKind.Stdio) {
		if (!state.command.trim()) {
			result.command = localize('mcpForm.command.required', "A command is required.");
		}
		result.args = parseMcpServerArgs(state.args).error;
		result.env = validateKeyValues(state.env, localize('mcpForm.env.label', "environment variable"));
	} else {
		const url = state.url.trim();
		if (!url) {
			result.url = localize('mcpForm.url.required', "A URL is required.");
		} else if (!/^https?:\/\/.+/i.test(url) && !url.includes('${')) {
			result.url = localize('mcpForm.url.invalid', "The URL must start with 'http://' or 'https://'.");
		}
		result.headers = validateKeyValues(state.headers, localize('mcpForm.headers.label', "header"));
	}
	for (const key of Object.keys(result) as (keyof IMcpServerFormValidation)[]) {
		if (result[key] === undefined) {
			delete result[key];
		}
	}
	return result;
}

export function isMcpServerFormValid(validation: IMcpServerFormValidation): boolean {
	return Object.keys(validation).length === 0;
}

function validateKeyValues(entries: readonly IMcpServerFormKeyValue[], kind: string): string | undefined {
	const seen = new Set<string>();
	for (const entry of entries) {
		const name = entry.name.trim();
		if (!name) {
			if (entry.value) {
				return localize('mcpForm.keyValue.missingName', "Every {0} with a value needs a name.", kind);
			}
			continue;
		}
		if (seen.has(name)) {
			return localize('mcpForm.keyValue.duplicate', "The {0} '{1}' is defined more than once.", kind, name);
		}
		seen.add(name);
	}
	return undefined;
}

/**
 * Builds the configuration to persist from the form state. Properties the form
 * does not edit (for example `gallery`, `dev`, `oauth` or `sandboxEnabled`) are
 * preserved from {@link original} as long as the server kind does not change, and
 * env values keep their original `number`/`null` types when left unchanged.
 *
 * Callers should validate the state with {@link validateMcpServerFormState} first.
 */
export function toMcpServerConfiguration(state: IMcpServerFormState, original: IMcpServerConfiguration): IMcpServerConfiguration {
	const common = { version: original.version, gallery: original.gallery, dev: original.dev };

	if (state.kind === McpServerFormKind.Stdio) {
		const base = original.type === McpServerType.LOCAL ? original : common;
		const originalEnv = original.type === McpServerType.LOCAL ? original.env : undefined;
		const { args } = parseMcpServerArgs(state.args);
		const env: Record<string, string | number | null> = {};
		for (const { name, value } of state.env) {
			const key = name.trim();
			if (key) {
				env[key] = restoreEnvValue(value, originalEnv?.[key]);
			}
		}
		const result: Mutable<IMcpStdioServerConfiguration> = {
			...base,
			type: McpServerType.LOCAL,
			command: state.command.trim(),
			args: args.length ? args : undefined,
			cwd: state.cwd.trim() || undefined,
			envFile: state.envFile.trim() || undefined,
			env: Object.keys(env).length ? env : undefined,
		};
		return removeUndefined(result);
	}

	const base = original.type === McpServerType.REMOTE ? original : common;
	const headers: Record<string, string> = {};
	for (const { name, value } of state.headers) {
		const key = name.trim();
		if (key) {
			headers[key] = value;
		}
	}
	const originalTransport = original.type === McpServerType.REMOTE ? original.transport : undefined;
	const result: Mutable<IMcpRemoteServerConfiguration> = {
		...base,
		type: McpServerType.REMOTE,
		url: state.url.trim(),
		transport: state.kind === McpServerFormKind.Sse ? 'sse' : (originalTransport === 'http' ? 'http' : undefined),
		headers: Object.keys(headers).length ? headers : undefined,
	};
	return removeUndefined(result);
}

function restoreEnvValue(value: string, original: string | number | null | undefined): string | number | null {
	if (original === null && value === '') {
		return null;
	}
	if (typeof original === 'number' && String(original) === value) {
		return original;
	}
	return value;
}

function removeUndefined<T extends object>(value: T): T {
	for (const key of Object.keys(value) as (keyof T)[]) {
		if (value[key] === undefined) {
			delete value[key];
		}
	}
	return value;
}
