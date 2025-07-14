/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../service/promptsService.js';
import { IPromptFileReference } from '../parsers/types.js';
import { ProviderInstanceBase } from './providerInstanceBase.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { ProviderInstanceManagerBase, TProviderClass } from './providerInstanceManagerBase.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { localize } from '../../../../../../nls.js';

/**
 * Unique ID of the markers provider class.
 */
const MARKERS_OWNER_ID = 'prompt-link-diagnostics-provider';

/**
 * Prompt links diagnostics provider for a single text model.
 */
class PromptLinkDiagnosticsProvider extends ProviderInstanceBase {
	constructor(
		model: ITextModel,
		@IPromptsService promptsService: IPromptsService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IFileService private readonly fileService: IFileService
	) {
		super(model, promptsService);
	}

	/**
	 * Update diagnostic markers for the current editor.
	 */
	protected override async onPromptSettled(): Promise<void> {
		// clean up all previously added markers
		this.markerService.remove(MARKERS_OWNER_ID, [this.model.uri]);

		const markers: IMarkerData[] = [];

		const stats = await this.fileService.resolveAll(this.parser.references.map(ref => ({ resource: ref.uri })));
		for (let i = 0; i < stats.length; i++) {
			if (!stats[i].success) {
				markers.push(toMarker(this.parser.references[i], localize('fileNotFound', 'File not found.')));
			}
		}

		this.markerService.changeOne(
			MARKERS_OWNER_ID,
			this.model.uri,
			markers,
		);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		return `prompt-link-diagnostics:${this.model.uri.path}`;
	}
}

/**
 * Convert a prompt link with an issue to a marker data.
 *
 * @throws
 *  - if there is no link issue (e.g., `topError` undefined)
 *  - if there is no link range to highlight (e.g., `linkRange` undefined)
 *  - if the original error is of `NotPromptFile` type - we don't want to
 *    show diagnostic markers for non-prompt file links in the prompts
 */
function toMarker(link: IPromptFileReference, message: string): IMarkerData {
	const { linkRange } = link;

	assertDefined(
		linkRange,
		'Link range must to be defined.',
	);


	return {
		message: message,
		severity: MarkerSeverity.Warning,
		...linkRange,
	};
}

/**
 * The class that manages creation and disposal of {@link PromptLinkDiagnosticsProvider}
 * classes for each specific editor text model.
 */
export class PromptLinkDiagnosticsInstanceManager extends ProviderInstanceManagerBase<PromptLinkDiagnosticsProvider> {
	protected override get InstanceClass(): TProviderClass<PromptLinkDiagnosticsProvider> {
		return PromptLinkDiagnosticsProvider;
	}
}
