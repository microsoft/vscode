/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { LocalModelErrorAction } from '../../../../../../platform/agentHost/common/localModel.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ILocalModelService } from '../../../../../services/agentHost/common/localModelService.js';
import { openLocalModelServerPathSetting } from './localModelSetupFlow.js';

/*
 * The fixes of an on-device model error (`ILocalModelErrorV1.actions`): their
 * labels and what they do, shared by every surface that shows such an error
 * (the model's detail page in the model picker, the chat input notice).
 */

/**
 * The page that says how to get a llama.cpp build for on-device models and
 * point VS Code at it. VS Code doesn't install llama.cpp.
 */
export const LOCAL_MODEL_GET_LLAMA_CPP_URL = 'https://github.com/ggml-org/llama.cpp/releases';

/** The label of an error's fix, the same wherever the error shows. */
export function getLocalModelErrorActionLabel(action: LocalModelErrorAction): string {
	switch (action) {
		case 'retry': return localize('localModel.errorAction.retry', "Retry");
		case 'stopPrevious': return localize('localModel.errorAction.stopPrevious', "Stop Previous Server");
		case 'openSettings': return localize('localModel.errorAction.openSettings', "Open Settings");
		case 'getLlamaCpp': return localize('localModel.errorAction.getLlamaCpp', "Get llama.cpp");
	}
}

/** What running an error's fix needs. */
export interface ILocalModelErrorActionContext {
	readonly connection: IAgentConnection;
	readonly localModelService: ILocalModelService;
	readonly commandService: ICommandService;
	readonly openerService: IOpenerService;
}

/** Opens {@link LOCAL_MODEL_GET_LLAMA_CPP_URL} in the browser. */
export function openLocalModelGetLlamaCpp(openerService: IOpenerService): Promise<boolean> {
	return openerService.open(URI.parse(LOCAL_MODEL_GET_LLAMA_CPP_URL), { openExternal: true, allowCommands: false, fromUserGesture: true });
}

/**
 * Runs an error's fix. Retry retries the failed operation `operationId`, or,
 * for an error of the active model's server (no operation), loads it again,
 * which also finds a llama.cpp installed since. Open Settings opens
 * `chat.copilot.localModel.llamaServerPath`; Get llama.cpp opens the page that
 * says how to get llama.cpp.
 */
export function runLocalModelErrorAction(action: LocalModelErrorAction, operationId: string | undefined, context: ILocalModelErrorActionContext): Promise<unknown> {
	const { connection, localModelService } = context;
	switch (action) {
		case 'retry':
			return Promise.resolve(operationId !== undefined ? localModelService.retry(connection, operationId) : localModelService.start(connection));
		case 'stopPrevious':
			return Promise.resolve(localModelService.stopPrevious(connection));
		case 'openSettings':
			return openLocalModelServerPathSetting(context.commandService);
		case 'getLlamaCpp':
			return openLocalModelGetLlamaCpp(context.openerService);
	}
}
