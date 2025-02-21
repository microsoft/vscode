/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const ensureTrailingSlash = (str: string) => (str.endsWith('/') ? str : `${str}/`);

const replaceTilde = (path: string, homeDir: string) => {
	if (path.startsWith('~') && (path.length === 1 || path.charAt(1) === '/')) {
		return path.replace('~', homeDir);
	}
	return path;
};

const replaceVariables = (path: string, environmentVariables: Record<string, string>) => {
	// Replace simple $VAR variables
	const resolvedSimpleVariables = path.replace(/\$([A-Za-z0-9_]+)/g, (key) => {
		const envKey = key.slice(1);
		return environmentVariables[envKey] ?? key;
	});

	// Replace complex ${VAR} variables
	const resolvedComplexVariables = resolvedSimpleVariables.replace(
		/\$\{([A-Za-z0-9_]+)(?::-([^}]+))?\}/g,
		(match, envKey, defaultValue) => environmentVariables[envKey] ?? defaultValue ?? match
	);

	return resolvedComplexVariables;
};

export const shellExpand = (path: string, context: Fig.ShellContext): string => {
	const { environmentVariables } = context;
	return replaceVariables(
		replaceTilde(path, environmentVariables?.HOME ?? '~'),
		environmentVariables
	);
};
