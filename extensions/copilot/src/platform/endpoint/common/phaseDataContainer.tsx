/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, Raw } from '@vscode/prompt-tsx';
import { CustomDataPartMimeTypes } from './endpointTypes';

interface IPhaseDataOpaque {
	type: typeof CustomDataPartMimeTypes.PhaseData;
	phase: string;
}

export interface IPhaseDataContainerProps extends BasePromptElementProps {
	phase: string;
}

/**
 * Helper element to embed phase data into assistant messages
 * as an opaque content part.
 */
export class PhaseDataContainer extends PromptElement<IPhaseDataContainerProps> {
	render() {
		const { phase } = this.props;
		const container: IPhaseDataOpaque = { type: CustomDataPartMimeTypes.PhaseData, phase };
		return <opaque value={container} />;
	}
}

/**
 * Attempts to parse a Raw opaque content part into a phase string, if the type matches.
 */
export function rawPartAsPhaseData(part: Raw.ChatCompletionContentPartOpaque): string | undefined {
	const value = part.value as unknown;
	if (!value || typeof value !== 'object') {
		return;
	}

	const data = value as IPhaseDataOpaque;
	if (data.type === CustomDataPartMimeTypes.PhaseData && typeof data.phase === 'string') {
		return data.phase;
	}
	return;
}
