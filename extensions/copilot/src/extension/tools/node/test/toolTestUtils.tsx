/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, ToolResult, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { getTextPart } from '../../../../platform/chat/common/globalStringUtils';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IInstantiationService, ServicesAccessor } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';

export async function toolResultToString(accessor: ServicesAccessor, result: vscode.LanguageModelToolResult) {
	return renderElementToString(accessor, <ToolResult data={result} />);
}

export async function renderElementToString(accessor: ServicesAccessor, element: PromptElement) {
	const clz = class extends PromptElement {
		render() {
			return <UserMessage>
				{element}
			</UserMessage>;
		}
	};

	const endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-base');
	const renderer = PromptRenderer.create(accessor.get(IInstantiationService), endpoint, clz, {});

	const r = await renderer.render();
	return r.messages.map(m => getTextPart(m.content)).join('\n').replace(/\\+/g, '/');
}
