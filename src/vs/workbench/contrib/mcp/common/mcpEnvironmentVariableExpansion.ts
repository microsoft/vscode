/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createEnvVarResolver, EnvVarEnvironment, hasEnvVarReferences, IEnvVarResolverOptions } from '../../../../platform/mcp/common/envVarResolution.js';
import { McpServerEnvironmentVariableExpansion, McpServerLaunch, McpServerTransportType } from './mcpTypes.js';

export interface IMcpEnvironmentVariableExpansionContext {
	/** Environment of the host that runs or connects to the server. */
	readonly env: EnvVarEnvironment;
	/** Whether `env` has Windows `process.env` semantics, where variable names are case-insensitive. */
	readonly caseInsensitive: boolean;
}

/**
 * Only the `${VAR}` and `${VAR:-default}` forms that migration from `.vscode/mcp.json`
 * writes are expanded. Bare `$VAR` is copied unchanged by the migration and was always
 * literal in VS Code, so it stays literal.
 */
const expansionOptions: IEnvVarResolverOptions = { bareReferences: false };

/**
 * The Copilot runtime validates a remote server's URL as written, before expanding it,
 * and rejects the server if it doesn't parse. That rules out a reference in the port,
 * the scheme, a whole-URL reference, or a host with a `:-` default. Such URLs are left
 * unexpanded, as before, so a server never works here while being rejected in Copilot.
 */
function getExpandableUrl(expansion: McpServerEnvironmentVariableExpansion): string | undefined {
	return expansion.url !== undefined && URL.canParse(expansion.url) ? expansion.url : undefined;
}

/** Whether any field that {@link expandEnvironmentVariablesInLaunch} expands contains a reference. */
export function launchHasEnvironmentVariableReferences(launch: McpServerLaunch, expansion: McpServerEnvironmentVariableExpansion): boolean {
	const has = (value: string) => hasEnvVarReferences(value, expansionOptions);
	if (launch.type === McpServerTransportType.HTTP) {
		const url = getExpandableUrl(expansion);
		return (url !== undefined && has(url))
			|| launch.headers.some(([, value]) => has(value));
	}
	return has(launch.command)
		|| launch.args.some(has)
		|| Object.values(launch.env).some(value => typeof value === 'string' && has(value));
}

/**
 * Expands environment variable references with the Copilot CLI's rules, using the
 * environment of the host that runs or connects to the server:
 *
 * - Stdio: `command`, each of `args`, and `env` values. Environment variable names are never expanded.
 * - HTTP: the URL, if the Copilot runtime would accept it, and header values. Header names are never expanded.
 */
export function expandEnvironmentVariablesInLaunch(launch: McpServerLaunch, expansion: McpServerEnvironmentVariableExpansion, context: IMcpEnvironmentVariableExpansionContext): McpServerLaunch {
	const resolve = createEnvVarResolver(context.env, context.caseInsensitive, expansionOptions);
	if (launch.type === McpServerTransportType.HTTP) {
		const url = getExpandableUrl(expansion);
		return {
			...launch,
			uri: url !== undefined ? URI.parse(resolve(url)) : launch.uri,
			headers: launch.headers.map(([name, value]) => [name, resolve(value)]),
		};
	}

	return {
		...launch,
		command: resolve(launch.command),
		args: launch.args.map(resolve),
		env: Object.fromEntries(Object.entries(launch.env).map(([name, value]) => [name, typeof value === 'string' ? resolve(value) : value])),
	};
}
