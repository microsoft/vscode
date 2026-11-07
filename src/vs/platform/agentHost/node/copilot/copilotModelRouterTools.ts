/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tool, ToolResultObject } from '@github/copilot-sdk';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { basename, dirname, extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { ILogService } from '../../../log/common/log.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { readAgentModelByokIdentifier } from '../../common/agentModelByokMeta.js';
import { readAgentModelNoticesMeta } from '../../common/agentModelNotices.js';
import { isRoutableModel, modelRouterNameFromFileName, parseModelRouter, resolveModelRouter, supportedModelEfforts, type IModelRouterDiagnostic } from '../../common/modelRouter.js';
import { PolicyState } from '../../common/state/protocol/channels-root/state.js';
import type { IModelRouterFile } from './copilotModelRouterCatalog.js';

export const CheckModelRouterToolName = 'check_model_router';

const checkModelRouterDescription = 'Check model router files (.model-router.yaml) against their format and the models this account can use. Call it with no arguments to list the routers and available models (ids, effort levels, retirements), and with `path` after every edit to a router file. Read-only.';

/** What the check tool needs from the Copilot agent. */
export interface IModelRouterToolHost {
	/** Read live, since the tool stays in sessions that started while routers were on. */
	isEnabled(): boolean;
	/** The routers found in the user's folders. */
	listRouters(): Promise<readonly IModelRouterFile[]>;
	/** The folders routers are read from. The tool checks no file outside them. */
	readonly folders: readonly URI[];
	readFile(uri: URI): Promise<string>;
	/** The models the chat's account can use. */
	models(): Promise<readonly IAgentModelInfo[]>;
}

interface ICheckedDiagnostic {
	readonly severity: string;
	readonly message: string;
	readonly line?: number;
}

/** Router files the check tool reports on, with what it found. */
export interface IModelRouterCheck {
	readonly name: string;
	readonly path: string;
	readonly valid: boolean;
	readonly diagnostics: readonly ICheckedDiagnostic[];
	readonly routes?: readonly { readonly route: number; readonly model: string; readonly matched: string; readonly effort?: string; readonly supportedEfforts: readonly string[]; readonly retiring?: string }[];
}

export function createCopilotModelRouterTools(enabled: boolean, host: IModelRouterToolHost, logService: ILogService): Tool<unknown>[] {
	if (!enabled) {
		return [];
	}
	return [{
		name: CheckModelRouterToolName,
		description: checkModelRouterDescription,
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Absolute path of a .model-router.yaml file to check. Omit to list every router and the available models.' },
			},
			additionalProperties: false,
		},
		// Only needed while authoring a router, so it waits for tool search instead of costing every turn.
		defer: 'auto',
		metadata: {
			'github.com/copilot:safeForTelemetry': { name: true, inputsNames: false },
		},
		handler: async (args: unknown): Promise<ToolResultObject> => {
			if (!host.isEnabled()) {
				return { textResultForLlm: 'Model routers are turned off (setting chat.copilot.modelRouter.enabled).', resultType: 'failure', error: 'Model routers are turned off' };
			}
			try {
				const path = typeof (args as { path?: unknown })?.path === 'string' ? (args as { path: string }).path : undefined;
				const models = await host.models();
				const result = path !== undefined
					? { router: await checkFile(host, URI.file(path), models) }
					: { routers: await Promise.all((await host.listRouters()).map(file => checkRouter(host, file, models))) };
				return { textResultForLlm: JSON.stringify({ ...result, availableModels: describeModels(models) }, undefined, 1), resultType: 'success' };
			} catch (error) {
				const message = getErrorMessage(error);
				logService.error(error, '[ModelRouter] check_model_router failed');
				return { textResultForLlm: `Could not check the model router: ${message}`, resultType: 'failure', error: message };
			}
		},
	}];
}

async function checkFile(host: IModelRouterToolHost, uri: URI, models: readonly IAgentModelInfo[]): Promise<IModelRouterCheck> {
	const fileName = basename(uri);
	if (modelRouterNameFromFileName(fileName) === undefined) {
		return { name: fileName, path: uri.fsPath, valid: false, diagnostics: [{ severity: 'error', message: 'A model router file name ends with .model-router.yaml or .model-router.yml.' }] };
	}
	if (!host.folders.some(folder => extUriBiasedIgnorePathCase.isEqual(dirname(uri), folder))) {
		return { name: fileName, path: uri.fsPath, valid: false, diagnostics: [{ severity: 'error', message: `Model routers are read only from ${host.folders.map(folder => folder.fsPath).join(' and ')}.` }] };
	}
	const content = await host.readFile(uri);
	const parsed = parseModelRouter(content, fileName);
	return check(parsed.router?.name ?? parsed.name ?? modelRouterNameFromFileName(fileName)!, uri, parsed.router, parsed.diagnostics, models, content);
}

async function checkRouter(host: IModelRouterToolHost, file: IModelRouterFile, models: readonly IAgentModelInfo[]): Promise<IModelRouterCheck> {
	let content: string | undefined;
	try {
		content = await host.readFile(file.uri);
	} catch {
		// Report without line numbers.
	}
	return check(file.name, file.uri, file.router, file.diagnostics, models, content);
}

function check(name: string, uri: URI, router: IModelRouterFile['router'], parseDiagnostics: readonly IModelRouterDiagnostic[], models: readonly IAgentModelInfo[], content: string | undefined): IModelRouterCheck {
	const resolution = router ? resolveModelRouter(router, models) : undefined;
	const diagnostics = [...parseDiagnostics, ...resolution?.diagnostics ?? []].map(diagnostic => ({
		severity: diagnostic.severity,
		message: diagnostic.message,
		...(content !== undefined && diagnostic.startOffset !== undefined ? { line: lineOf(content, diagnostic.startOffset) } : {}),
	}));
	return {
		name,
		path: uri.fsPath,
		valid: !!router,
		diagnostics,
		...(router && resolution ? {
			routes: resolution.routes.map(resolved => ({
				route: router.routes.indexOf(resolved.route) + 1,
				model: resolved.reference,
				matched: readAgentModelByokIdentifier(resolved.model) ?? resolved.model.id,
				...(resolved.effort ? { effort: resolved.effort } : {}),
				supportedEfforts: resolved.supportedEfforts,
				...(resolved.retiring ? { retiring: resolved.retiring } : {}),
			})),
		} : {}),
	};
}

function describeModels(models: readonly IAgentModelInfo[]) {
	return models.filter(isRoutableModel).map(model => {
		const retiring = readAgentModelNoticesMeta(model).warningText?.model_pending_deprecation;
		return {
			id: readAgentModelByokIdentifier(model) ?? model.id,
			name: model.name,
			efforts: supportedModelEfforts(model),
			...(retiring ? { retiring } : {}),
			...(model.policyState === PolicyState.Disabled ? { disabledByPolicy: true } : {}),
		};
	});
}

function lineOf(content: string, offset: number): number {
	let line = 1;
	for (let i = 0; i < offset && i < content.length; i++) {
		if (content.charCodeAt(i) === 10) {
			line++;
		}
	}
	return line;
}
