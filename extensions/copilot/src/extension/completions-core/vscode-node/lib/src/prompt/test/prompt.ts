/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vscode-languageserver-protocol';
import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { createCompletionState } from '../../completionState';
import { getGhostText } from '../../ghostText/ghostText';
import { TelemetryWithExp } from '../../telemetry';
import { IPosition, ITextDocument } from '../../textDocument';
import { ICompletionsContextProviderBridgeService } from '../components/contextProviderBridge';
import { extractPrompt, ExtractPromptOptions } from '../prompt';
import { GhostTextLogContext } from '../../../../../common/ghostTextContext';
import { LlmNESTelemetryBuilder } from '../../../../../../inlineEdits/node/nextEditProviderTelemetry';
import { ILogService } from '../../../../../../../platform/log/common/logService';

export async function extractPromptInternal(
	accessor: ServicesAccessor,
	completionId: string,
	textDocument: ITextDocument,
	position: IPosition,
	telemetryWithExp: TelemetryWithExp,
	promptOpts: ExtractPromptOptions = {}
) {
	const completionState = createCompletionState(textDocument, position);
	const contextProviderBridge = accessor.get(ICompletionsContextProviderBridgeService);
	contextProviderBridge.schedule(completionState, completionId, 'opId', telemetryWithExp);
	return extractPrompt(accessor, completionId, completionState, telemetryWithExp, undefined, promptOpts);
}

export async function getGhostTextInternal(
	accessor: ServicesAccessor,
	textDocument: ITextDocument,
	position: IPosition,
	token?: CancellationToken
) {
	const telemetryBuilder = new LlmNESTelemetryBuilder(undefined, undefined, undefined, 'ghostText', undefined);
	const logService = accessor.get(ILogService);
	return getGhostText(accessor, createCompletionState(textDocument, position), token, { opportunityId: 'opId' }, new GhostTextLogContext(textDocument.uri, textDocument.version, undefined), telemetryBuilder, logService);
}
