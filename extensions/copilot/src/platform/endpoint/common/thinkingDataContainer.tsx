/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, Raw } from '@vscode/prompt-tsx';
import { ThinkingData, ThinkingOriginApi } from '../../thinking/common/thinking';
import { CustomDataPartMimeTypes } from './endpointTypes';

interface IThinkingDataOpaque {
	type: typeof CustomDataPartMimeTypes.ThinkingData;
	thinking: ThinkingData;
	/**
	 * The API that produced `thinking`. This is envelope-level rather than per-block: one
	 * round is one request, so a single tag describes its whole payload. Undefined for rounds
	 * persisted before provenance was tracked, and for payloads that crossed a boundary
	 * unable to carry it.
	 */
	originApi?: ThinkingOriginApi;
}

export interface IThinkingDataContainerProps extends BasePromptElementProps {
	thinking: ThinkingData;
	originApi?: ThinkingOriginApi;
}

/**
 * Helper element to embed thinking data into assistant messages
 * as an opaque content part.
 */
export class ThinkingDataContainer extends PromptElement<IThinkingDataContainerProps> {
	render() {
		const { thinking, originApi } = this.props;
		// `originApi` lives inside the same opaque value as its payload so prompt pruning can
		// never keep the reasoning while dropping the provenance needed to replay it.
		const container: IThinkingDataOpaque = { type: CustomDataPartMimeTypes.ThinkingData, thinking, originApi };
		return <opaque value={container} tokenUsage={thinking.tokens} />;
	}
}

export interface IThinkingEnvelope {
	readonly thinking: ThinkingData;
	readonly originApi?: ThinkingOriginApi;
}

/**
 * Attempts to parse a Raw opaque content part into a thinking payload and its provenance.
 */
export function rawPartAsThinkingEnvelope(part: Raw.ChatCompletionContentPartOpaque): IThinkingEnvelope | undefined {
	const value = part.value as unknown;
	if (!value || typeof value !== 'object') {
		return;
	}

	const data = value as IThinkingDataOpaque;
	if (data.type === CustomDataPartMimeTypes.ThinkingData && data.thinking && typeof data.thinking === 'object') {
		return { thinking: data.thinking, originApi: data.originApi };
	}
	return;
}

/**
 * Attempts to parse a Raw opaque content part into ThinkingData, if the type matches.
 */
export function rawPartAsThinkingData(part: Raw.ChatCompletionContentPartOpaque): ThinkingData | undefined {
	return rawPartAsThinkingEnvelope(part)?.thinking;
}
