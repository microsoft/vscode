/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../../base/common/iterator.js';
import { findNodeAtLocation, Node, parse, parseTree } from '../../../../../base/common/json.js';
import { parseConfigurationVariable } from '../../../../../platform/configuration/common/configurationVariables.js';
import { resolveEnvVars } from '../../../../../platform/mcp/common/envVarResolution.js';
import { ConfigurationResolverExpression, Replacement } from '../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IMcpServerCustomizationMigrationInputDeclaration, IMcpServerCustomizationMigrationVariable, McpServerCustomizationMigrationFailureReason } from '../../common/promptSyntax/service/customizationMigrationService.js';

/*
 * How `${input:}` references, which the Copilot harness can't prompt for, are replaced with environment
 * variables when an MCP server is migrated.
 */

/** The parts of a source MCP configuration file that the analysis of each of its servers depends on. */
export interface IMcpSourceFile {
	readonly servers: Record<string, unknown>;
	/** The file's top-level `inputs`, as written. */
	readonly inputs: unknown;
}

/** The parts of a parsed source document that its servers are analyzed with, or `undefined` if it has no `servers` object. */
export function getMcpSourceFile(document: Record<string, unknown>): IMcpSourceFile | undefined {
	const servers = document.servers;
	return isJsonObject(servers) ? { servers, inputs: document.inputs } : undefined;
}

/** Environment variable names that the Copilot runtime and the local harness expand in `${NAME}`. */
export const environmentVariableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Whether `${NAME:-default}`, written at `offset` in `value`, is read back as written by the resolver that the
 * destination and the local harness use: it must end where it was written, whether or not `NAME` is set, and
 * produce exactly its default when `NAME` is unset. Text after it, such as a `}`, can change where a default ends.
 */
export function isDefaultReferenceIntact(value: string, offset: number, reference: string, name: string, defaultValue: string): boolean {
	const unset = {};
	const set = { [name]: '\0' };
	const rest = value.slice(offset + reference.length);
	const fromReference = value.slice(offset);
	return resolveEnvVars(reference, unset, false) === defaultValue
		&& resolveEnvVars(fromReference, unset, false) === defaultValue + resolveEnvVars(rest, unset, false)
		&& resolveEnvVars(fromReference, set, false) === '\0' + resolveEnvVars(rest, set, false);
}

/**
 * Environment variable names that an input is not migrated to, in uppercase, since Windows names are
 * case-insensitive. A reserved name is written as `MCP_<NAME>` instead.
 */
const reservedVariableNames: { readonly names: ReadonlySet<string>; readonly prefixes: readonly string[] } = {
	names: new Set([
		// Usually set by the OS or the shell, so `${NAME:-default}` would never use its default.
		'PATH', 'PATHEXT', 'HOME', 'USER', 'USERNAME', 'USERPROFILE', 'LOGNAME', 'SHELL', 'PWD', 'OLDPWD',
		'TMPDIR', 'TEMP', 'TMP', 'LANG', 'TERM', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'SYSTEMROOT',
		'WINDIR', 'COMSPEC', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_OPTIONS', 'GITHUB_TOKEN',
		// Removed from the environment that the Copilot runtime expands MCP configuration with, so `${NAME}`
		// would never resolve there: `FILTER_FROM_SHELLS_AND_MCP_BASE` in `storage_base/settings_env.rs` and
		// the `SECRET_ENV_VAR_NAMES` it includes, beyond the prefixes below.
		'NODE_ENV', 'GITHUB_TOKEN_VARNAME', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'GITHUB_MCP_SERVER_TOKEN',
		'GITHUB_VERIFICATION_TOKEN', 'CAPI_HMAC_KEY', 'CAPI_HMAC_KEY_OVERRIDE', 'CAPI_AZURE_KEY_VAULT_URI',
		'AIP_SWE_AGENT_TOKEN', 'BLACKBIRD_AUTH_METIS_API_KEY', 'BLACKBIRD_AUTH_MODEL_BASED_RETRIEVAL_TOKEN',
		// Read as empty by Claude Code in remote URLs and headers: "Credential variables that read as empty"
		// in https://code.claude.com/docs/en/mcp.
		'NPM_TOKEN', 'AWS_BEARER_TOKEN_BEDROCK',
	]),
	prefixes: [
		// Copilot runtime (see above). It also sets `GIT_CONFIG_*` for every server.
		'COPILOT_', 'GITHUB_COPILOT_', 'OTEL_', 'GIT_CONFIG_',
		// Claude Code (see above).
		'ANTHROPIC_', 'OPENAI_', 'AZURE_OPENAI_',
	],
};

/**
 * The environment variable that an input id migrates to: the id in uppercase, with every
 * character other than an ASCII letter or digit replaced by `_`. It is prefixed with `MCP_` if that name is
 * reserved or starts with a digit, which a variable name can't. `undefined` for an empty key.
 */
export function getVariableName(key: string): string | undefined {
	const name = key.replace(/[^A-Za-z0-9]/gu, '_').toUpperCase();
	if (!name) {
		return undefined;
	}
	const needsPrefix = /^[0-9]/.test(name)
		|| reservedVariableNames.names.has(name)
		|| reservedVariableNames.prefixes.some(prefix => name.startsWith(prefix));
	const prefixed = needsPrefix ? `MCP_${name}` : name;
	return environmentVariableNamePattern.test(prefixed) ? prefixed : undefined;
}

/**
 * Reads the declaration of an input from the top-level `inputs` of the file that references it, which is
 * where VS Code looks it up. Like VS Code, the last declaration with the id is used.
 */
function getInputDeclaration(id: string, inputs: unknown): IMcpServerCustomizationMigrationInputDeclaration | McpServerCustomizationMigrationFailureReason {
	const declaration = Array.isArray(inputs) ? inputs.filter(input => isJsonObject(input) && input.id === id).pop() : undefined;
	// VS Code can't prompt for an input without a description, so such a server never started.
	if (!isJsonObject(declaration) || typeof declaration.description !== 'string') {
		return McpServerCustomizationMigrationFailureReason.UnsupportedInputType;
	}
	const defaultValue = declaration.default;
	switch (declaration.type) {
		case 'promptString':
			if (declaration.password) {
				return McpServerCustomizationMigrationFailureReason.UnsupportedInputType;
			}
			// VS Code shows a numeric default in the input box as text, so it is the same as the string.
			if (defaultValue !== undefined && typeof defaultValue !== 'string' && typeof defaultValue !== 'number') {
				return McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault;
			}
			return { type: 'promptString', ...(defaultValue !== undefined ? { default: String(defaultValue) } : {}) };
		case 'pickString': {
			// VS Code matches a pick default with `===`, so a default that isn't a string is never used.
			if (defaultValue !== undefined && typeof defaultValue !== 'string') {
				return McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault;
			}
			const options = Array.isArray(declaration.options)
				? declaration.options.map(option => typeof option === 'string' ? option : isJsonObject(option) && typeof option.value === 'string' ? option.value : undefined)
				: undefined;
			if (!options || options.some(option => option === undefined)) {
				return McpServerCustomizationMigrationFailureReason.UnsupportedInputType;
			}
			// VS Code only marks the option whose value equals the default, so any other default is never used.
			if (defaultValue !== undefined && !options.includes(defaultValue)) {
				return McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault;
			}
			return { type: 'pickString', ...(defaultValue !== undefined ? { default: defaultValue } : {}), options: options as string[] };
		}
		default:
			return McpServerCustomizationMigrationFailureReason.UnsupportedInputType;
	}
}

/**
 * Determines how each input a server references is migrated. Variables come from the environment, which
 * every server shares, so an input must not map to the same variable as a different input or `${env:}`
 * reference in the same file: they hold different values today.
 */
export function getMigratedVariables(inputIds: ReadonlySet<string>, sourceFile: IMcpSourceFile): IMcpServerCustomizationMigrationVariable[] | McpServerCustomizationMigrationFailureReason {
	const variables: IMcpServerCustomizationMigrationVariable[] = [];
	if (inputIds.size === 0) {
		return variables;
	}
	const fileEnvironmentVariableNames = new Set<string>();
	const fileInputIds = new Set<string>();
	for (const variable of getConfigurationVariables(sourceFile.servers)) {
		if (variable.arg === undefined) {
			continue;
		}
		if (variable.name === 'env') {
			fileEnvironmentVariableNames.add(variable.arg.toUpperCase());
		} else if (variable.name === 'input') {
			fileInputIds.add(variable.arg);
		}
	}

	for (const id of inputIds) {
		const declaration = getInputDeclaration(id, sourceFile.inputs);
		if (typeof declaration === 'string') {
			return declaration;
		}
		const name = getVariableName(id);
		if (!name) {
			return McpServerCustomizationMigrationFailureReason.InvalidInputName;
		}
		if (fileEnvironmentVariableNames.has(name) || [...fileInputIds].some(other => other !== id && getVariableName(other) === name)) {
			return McpServerCustomizationMigrationFailureReason.VariableNameCollision;
		}
		variables.push({ id, name, declaration });
	}
	return variables;
}

/**
 * Replaces each VS Code variable in `value`, found the same way as {@link ConfigurationResolverExpression} finds them.
 * `replace` also receives the offset in the result at which its replacement is written.
 */
export function replaceConfigurationVariables(value: string, replace: (variable: Replacement, offset: number) => string): string {
	let result = '';
	let copied = 0;
	let position = 0;
	while (position < value.length) {
		const start = value.indexOf('${', position);
		if (start === -1) {
			break;
		}
		const parsed = parseConfigurationVariable(value, start);
		if (!parsed) {
			position = start + 2;
			continue;
		}
		result += value.slice(copied, start);
		result += replace(parsed.replacement, result.length);
		copied = position = parsed.end + 1;
	}
	return result + value.slice(copied);
}

/** The VS Code variables in every string and property name of a JSON value. */
export function getConfigurationVariables(value: unknown): Iterable<Replacement> {
	// Wrapped, so that `windows`, `osx` and `linux` properties of the value are not applied as platform overrides.
	return ConfigurationResolverExpression.parse({ value }).unresolved();
}

/**
 * Removes the declarations of the given inputs, which migrated servers referenced, once nothing else in
 * the source document references them, such as another server or a root property. Inputs that were
 * already unreferenced are kept. The `inputs` array is removed once it is empty. Only the removed text
 * changes, so the rest of the file keeps its formatting.
 */
export function removeUnreferencedInputs(content: string, ids: ReadonlySet<string>): string {
	const document = parseJsonContent(content);
	if (ids.size === 0 || !isJsonObject(document) || !Array.isArray(document.inputs)) {
		return content;
	}
	const inputs: unknown[] = document.inputs;
	const removed: number[] = [];
	for (const id of ids) {
		const declarations = inputs.filter(input => isJsonObject(input) && input.id === id);
		const others = { ...document, inputs: inputs.filter(input => !declarations.includes(input)) };
		const isReferenced = Iterable.some(getConfigurationVariables(others), variable => variable.name === 'input' && variable.arg === id);
		if (!isReferenced) {
			removed.push(...declarations.map(declaration => inputs.indexOf(declaration)));
		}
	}
	if (removed.length === 0) {
		return content;
	}
	if (removed.length === inputs.length) {
		const property = findNodeAtLocation(parseTree(content, [], { allowTrailingComma: true })!, ['inputs'])?.parent;
		return property ? removeNode(content, property) : content;
	}
	// Removing from the end keeps the indexes of the remaining declarations valid.
	for (const index of removed.sort((a, b) => b - a)) {
		const node = findNodeAtLocation(parseTree(content, [], { allowTrailingComma: true })!, ['inputs', index]);
		if (node) {
			content = removeNode(content, node);
		}
	}
	return content;
}

/**
 * Removes an array element or object property with its separating comma: up to the next sibling, or for
 * the last sibling, from the end of the previous one.
 */
function removeNode(content: string, node: Node): string {
	const siblings = node.parent?.children ?? [];
	const index = siblings.indexOf(node);
	const next = siblings[index + 1];
	const previous = siblings[index - 1];
	const [start, end] = next
		? [node.offset, next.offset]
		: previous
			? [previous.offset + previous.length, node.offset + node.length]
			: [node.offset, node.offset + node.length];
	return content.slice(0, start) + content.slice(end);
}

export function parseJsonContent(content: string): unknown {
	return parse(content, [], { allowTrailingComma: true, allowEmptyContent: false });
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

