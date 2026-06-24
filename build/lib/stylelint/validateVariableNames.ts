/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'fs';
import path from 'path';

const RE_VAR_PROP = /var\(\s*(--([\w\-\.]+))/g;

let knownVariables: Set<string> | undefined;
function getKnownVariableNames() {
	if (!knownVariables) {
		const knownVariablesFileContent = readFileSync(path.join(import.meta.dirname, './vscode-known-variables.json'), 'utf8').toString();
		const knownVariablesInfo = JSON.parse(knownVariablesFileContent);
		knownVariables = new Set([...knownVariablesInfo.colors, ...knownVariablesInfo.others, ...(knownVariablesInfo.sizes || [])] as string[]);
	}
	return knownVariables;
}

const iconVariable = /^--vscode-icon-.+-(content|font-family)$/;

export interface IValidator {
	(value: string, report: (message: string) => void): void;
}

export function getVariableNameValidator(): IValidator {
	const allVariables = getKnownVariableNames();
	return (value: string, report: (unknwnVariable: string) => void) => {
		RE_VAR_PROP.lastIndex = 0; // reset lastIndex just to be sure
		let match;
		while (match = RE_VAR_PROP.exec(value)) {
			const variableName = match[1];
			if (variableName && !allVariables.has(variableName) && !iconVariable.test(variableName)) {
				report(variableName);
			}
		}
	};
}

