/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, Raw } from '@vscode/prompt-tsx';
import { ThinkingData } from '../../thinking/common/thinking';
import { CustomDataPartMimeTypes } from './endpointTypes';

interface IThinkingDataOpaque {
	type: typeof CustomDataPartMimeTypes.ThinkingData;
	thinking: ThinkingData;
}

export interface IThinkingDataContainerProps extends BasePromptElementProps {
	thinking: ThinkingData;
}

/**
 * Helper element to embed thinking data into assistant messages
 * as an opaque content part.
 */
export class ThinkingDataContainer extends PromptElement<IThinkingDataContainerProps> {
	render() {
		const { thinking } = this.props;
		const container: IThinkingDataOpaque = { type: CustomDataPartMimeTypes.ThinkingData, thinking };
		return <opaque value={container} tokenUsage={thinking.tokens} />;
	}
}

/**
 * Attempts to parse a Raw opaque content part into ThinkingData, if the type matches.
 */
export function rawPartAsThinkingData(part: Raw.ChatCompletionContentPartOpaque): ThinkingData | undefined {
	const value = part.value as unknown;
	if (!value || typeof value !== 'object') {
		return;
	}

	const data = value as IThinkingDataOpaque;
	if (data.type === CustomDataPartMimeTypes.ThinkingData && data.thinking && typeof data.thinking === 'object') {
		return data.thinking;
	}
	return;
}
