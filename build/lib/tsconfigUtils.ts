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
	const options = getCompilerOptionsFromTsConfig(configFilePath);
	const resolved = typeof options.target !== 'undefined' ? ts.ScriptTarget[options.target] : undefined;
	if (!resolved) {
		throw new Error(`Could not resolve target in ${configFilePath}`);
	}
	return resolved;
}

export function getCompilerOptionsFromTsConfig(configFilePath: string): ts.CompilerOptions {
	const parsed = ts.readConfigFile(configFilePath, ts.sys.readFile);
	if (parsed.error) {
		throw new Error(`Cannot read ${configFilePath}. TS error: ${parsed.error.messageText}`);
	}

	const cmdLine = ts.parseJsonConfigFileContent(parsed.config, ts.sys, dirname(configFilePath), {});
	if (cmdLine.errors.length > 0) {
		throw new Error(`Cannot read ${configFilePath}. TS errors: ${cmdLine.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n')}`);
	}
	return cmdLine.options;
}
