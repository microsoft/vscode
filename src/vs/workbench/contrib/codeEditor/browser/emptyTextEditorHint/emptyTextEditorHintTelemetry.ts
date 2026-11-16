/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUntitledDocumentTelemetryService } from '../../../../services/untitled/common/untitledDocumentTelemetry.js';

/**
 * `classic`: the single line hint. `actions`: the experimental list of actions (`workbench.editor.experimental.emptyEditorHintActions`).
 */
export type EmptyEditorHintVariant = 'classic' | 'actions';

export type EmptyEditorHintAction = 'generateCode' | 'newChatEditor' | 'selectLanguage' | 'openMarkdownEditor' | 'openEditor' | 'openWith' | 'close' | 'closeEscape' | 'dontShowAgain';

export function logEmptyEditorHintEvent(
	telemetryService: ITelemetryService,
	untitledDocumentTelemetryService: IUntitledDocumentTelemetryService,
	resource: URI | undefined,
	variant: EmptyEditorHintVariant,
	kind: 'shown' | 'action',
	action?: EmptyEditorHintAction,
): void {
	type EmptyEditorHintEvent = { kind: 'shown' | 'action'; action: EmptyEditorHintAction | undefined; variant: EmptyEditorHintVariant; scheme: string; untitledDocumentId: string | undefined };
	type EmptyEditorHintClassification = {
		owner: 'hediet';
		comment: 'How often the empty editor hint is shown and which of its actions are used.';
		kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'shown: the hint appeared. action: the user clicked one of its actions.' };
		action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action that was used. openMarkdownEditor/openEditor: the Open in row with the Markdown Editor or the editor last chosen from the hint. openWith: the editor picker was opened, from the dropdown of that row or the Open With Another Editor row (workbenchEditorReopen tells which editor was chosen). close/closeEscape: hidden for the editor with the close button or Escape.' };
		variant: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which hint was shown: classic (a single line) or actions (a list of actions).' };
		scheme: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The scheme of the document, e.g. untitled or file.' };
		untitledDocumentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The untitledDocumentId of the untitledDocument events, if the document is untitled.' };
	};
	telemetryService.publicLog2<EmptyEditorHintEvent, EmptyEditorHintClassification>('emptyEditorHint', {
		kind,
		action,
		variant,
		scheme: resource?.scheme ?? '',
		untitledDocumentId: untitledDocumentTelemetryService.getUntitledDocumentId(resource),
	});
}
