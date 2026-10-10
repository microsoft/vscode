/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../browser/labels.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { isChatTranscriptContextVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { TranscriptContextAttachmentWidget } from './chatAttachmentWidgets.js';
import { IChatAttachmentWidgetRegistry } from './chatAttachmentWidgetRegistry.js';

export class TranscriptContextAttachmentWidgetContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.transcriptContextAttachmentWidgetFactory';

	constructor(
		@IChatAttachmentWidgetRegistry registry: IChatAttachmentWidgetRegistry,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const labels = this._register(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		this._register(registry.registerFactory(
			'transcriptContext',
			(attachment, options, container) => {
				if (!isChatTranscriptContextVariableEntry(attachment)) {
					throw new Error('Expected a transcriptContext attachment');
				}
				return instantiationService.createInstance(TranscriptContextAttachmentWidget, attachment, undefined, options, container, labels);
			},
		));
	}
}
