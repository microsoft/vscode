/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { dirname, resolve } from 'node:path';
import { API } from '@typescript/native/unstable/sync';
import { ScriptTarget } from '@typescript/native/unstable/ast';

/**
 * Get the target (e.g. 'ES2024') from a tsconfig.json file.
 */
export function getTargetStringFromTsConfig(configFilePath: string): string {
	const fileName = resolve(configFilePath);
	const api = new API({ cwd: dirname(fileName) });
	try {
		const parsed = api.readConfigFile(fileName);
		if (parsed.error) {
			throw new Error(`Cannot determine target from ${configFilePath}. TS error: ${parsed.error.text}`);
		}

		const cmdLine = api.parseJsonConfigFileContent(parsed.config, { configFileName: fileName });
		const resolved = typeof cmdLine.options.target !== 'undefined' ? ScriptTarget[cmdLine.options.target] : undefined;
		if (!resolved) {
			throw new Error(`Could not resolve target in ${configFilePath}`);
		}
		return resolved;
	} finally {
		api.close();
	}
}