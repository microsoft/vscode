/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, Raw } from '@vscode/prompt-tsx';
import { OpenAIContextManagementResponse } from '../../networking/common/openai';
import { CustomDataPartMimeTypes } from './endpointTypes';

interface ICompactionDataOpaque {
	type: typeof CustomDataPartMimeTypes.ContextManagement;
	compaction: OpenAIContextManagementResponse;
}

export interface ICompactionDataContainerProps extends BasePromptElementProps {
	compaction: OpenAIContextManagementResponse;
}

/**
 * Helper element to embed compaction data into assistant messages
 * as an opaque content part, for round-tripping in Responses API requests.
 */
export class CompactionDataContainer extends PromptElement<ICompactionDataContainerProps> {
	render() {
		const { compaction } = this.props;
		const container: ICompactionDataOpaque = { type: CustomDataPartMimeTypes.ContextManagement, compaction };
		return <opaque value={container} />;
	}
}

/**
 * Attempts to parse a Raw opaque content part into compaction data, if the type matches.
 */
export function rawPartAsCompactionData(part: Raw.ChatCompletionContentPartOpaque): OpenAIContextManagementResponse | undefined {
	const value = part.value as unknown;
	if (!value || typeof value !== 'object') {
		return;
	}

	const data = value as ICompactionDataOpaque;
	if (data.type === CustomDataPartMimeTypes.ContextManagement && data.compaction && typeof data.compaction === 'object') {
		return data.compaction;
	}
	return;
}
