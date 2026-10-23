/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import type { DebugConfiguration } from 'vscode';
import { IExtensionsService } from '../../../platform/extensions/common/extensionsService';
import { IDebugConfigSchema, IPackageJson } from '../../../platform/extensions/common/packageJson';
import { extractCodeBlocks } from '../../../util/common/markdown';
import { ILaunchJSON, ITasksJSON } from '../common/launchConfigService';

export type IStartDebuggingParsedResponse = ILaunchJSON & Partial<ITasksJSON>;

/**
 * Parses a launch configuration from the response or any code blocks it contains.
 * Always returns a well-structured {@link ILaunchJSON}.
 */
export const parseLaunchConfigFromResponse = (response: string, extensionsService: IExtensionsService): IStartDebuggingParsedResponse | undefined => {

	const codeBlocks = extractCodeBlocks(response);
	const attempts = codeBlocks ? codeBlocks.map(c => c.code) : [response];

	const config = tryGetJsonDataFromPart(attempts, (parsed): ILaunchJSON | undefined => {
		if (parsed && 'configurations' in parsed && Array.isArray(parsed.configurations)) {
			parsed.configurations = parsed.configurations.map((config: IDebugConfigSchema) => processSchemaProperties(config, extensionsService));
			return parsed;
		}
		if (parsed && 'type' in parsed && 'request' in parsed) {
			return { configurations: [processSchemaProperties(parsed, extensionsService)] } as ILaunchJSON;
		}
	});

	const tasks = tryGetJsonDataFromPart(attempts, (parsed): ITasksJSON | undefined => {
		if (parsed && 'tasks' in parsed && Array.isArray(parsed.tasks)) {
			return parsed;
		}
		if (parsed && 'type' in parsed && 'label' in parsed) {
			return { tasks: [parsed] };
		}
	});

	return config && tasks ? { ...config, ...tasks } : config;
};

function tryGetJsonDataFromPart<T>(attempts: readonly string[], process: (parsed: any) => T) {
	for (const attempt of attempts) {
		try {
			const parsed = jsonc.parse(attempt);
			const processed = process(parsed);
			if (processed) {
				return processed;
			}
		} catch {
			// continue
		}
	}

	return undefined;
}

const defaultSchema = ['name', 'type', 'request', 'debugServer', 'preLaunchTask', 'postDebugTask', 'presentation', 'internalConsoleOptions', 'suppressMultipleSessionWarning'];
function processSchemaProperties(parsed: any, extensionsService: IExtensionsService): DebugConfiguration {
	// See #7684
	if ('type' in parsed && parsed['type'] === 'python') {
		parsed['type'] = 'debugpy';
	}
	const schema = getSchemasForType(parsed.type, extensionsService);
	if (!schema) {
		return parsed;
	}
	for (const property of Object.keys(parsed)) {
		if (defaultSchema.includes(property) || property in schema) {
			continue;
		}
		delete parsed[property];
	}
	return parsed;
}

export function getSchemasForTypeAsList(type: string, extensionsService: IExtensionsService): string[] | undefined {
	for (const extension of extensionsService.allAcrossExtensionHosts) {
		const debuggers = (extension.packageJSON as IPackageJson)?.contributes?.debuggers;
		if (!debuggers) {
			continue;
		}
		const debuggersForType = debuggers.filter(d => d.type === type && !d.deprecated);
		if (!Array.isArray(debuggersForType) || debuggersForType.length === 0) {
			continue;
		}

		const schemas = debuggersForType.filter(d => !!d.configurationAttributes.launch || !!d.configurationAttributes.attach).map(d => {
			const properties = [d.configurationAttributes.launch?.properties, d.configurationAttributes.attach?.properties].filter(p => p !== undefined).flat();
			return Object.entries(properties).map(p => {
				return Object.entries(p[1]).map(p => {
					return `${p[0]}: ${p[1].description || p[1].markdownDescription}`;
				}).flat();
			}).flat();
		}).flat();
		if (schemas.length) {
			return schemas;
		}
	}
	return;
}


export function getSchemasForType(type: string, extensionsService: IExtensionsService): object | undefined {
	for (const extension of extensionsService.allAcrossExtensionHosts) {
		const debuggers = (extension.packageJSON as IPackageJson)?.contributes?.debuggers;
		if (!debuggers) {
			continue;
		}
		const debuggersForType = debuggers.filter(d => d.type === type && !d.deprecated);
		if (!Array.isArray(debuggersForType) || debuggersForType.length === 0) {
			continue;
		}

		return debuggersForType.flatMap(d => [d.configurationAttributes.launch?.properties, d.configurationAttributes.attach?.properties]).filter(p => p !== undefined).reduce((accumulator, currentObject) => {
			return { ...accumulator, ...currentObject };
		}, {});
	}
	return;
}
