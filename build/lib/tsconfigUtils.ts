/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { dirname } from 'path';
import ts from 'typescript';

/**
 * Get the target (e.g. 'ES2024') from a tsconfig.json file.
 */
export function getTargetStringFromTsConfig(configFilePath: string): string {
	const parsed = ts.readConfigFile(configFilePath, ts.sys.readFile);
	if (parsed.error) {
		throw new Error(`Cannot determine target from ${configFilePath}. TS error: ${parsed.error.messageText}`);
	}

	const cmdLine = ts.parseJsonConfigFileContent(parsed.config, ts.sys, dirname(configFilePath), {});
	const resolved = typeof cmdLine.options.target !== 'undefined' ? ts.ScriptTarget[cmdLine.options.target] : undefined;
	if (!resolved) {
		throw new Error(`Could not resolve target in ${configFilePath}`);
	}
	return resolved;
}

