/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../../service/types.js';
import { IPromptFileReference } from '../../parsers/types.js';
import { assert } from '../../../../../../../base/common/assert.js';
import { NotPromptFile } from '../../../promptFileReferenceErrors.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { TextModelPromptParser } from '../../parsers/textModelPromptParser.js';
import { ObservableDisposable } from '../../../../../../../base/common/observableDisposable.js';
import { IPromptFileEditor, ProviderInstanceManagerBase } from './providerInstanceManagerBase.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../../../platform/markers/common/markers.js';

/**
 * Unique ID of the markers provider class.
 */
const MARKERS_OWNER_ID = 'reusable-prompts-syntax';

/**
 * Prompt links diagnostics provider for a single text model.
 */
class PromptLinkDiagnosticsProvider extends ObservableDisposable {
	/**
	 * Reference to the current prompt syntax parser instance.
	 */
	private readonly parser: TextModelPromptParser;

	constructor(
		private readonly editor: IPromptFileEditor,
		@IMarkerService private readonly markerService: IMarkerService,
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
		super();

		this.parser = this.promptsService
			.getSyntaxParserFor(this.model)
			.onUpdate(this.updateMarkers.bind(this))
			.onDispose(this.dispose.bind(this))
			.start();

		// initialize markers
		this.updateMarkers();
	}

	/**
	 * Underlying text model of the editor.
	 */
	private get model(): ITextModel {
		return this.editor.getModel();
	}

	/**
	 * Update diagnostic markers for the current editor.
	 */
	private async updateMarkers() {
		// ensure that parsing process is settled
		await this.parser.allSettled();

		// clean up all previously added markers
		this.markerService.remove(MARKERS_OWNER_ID, [this.model.uri]);

		const markers: IMarkerData[] = [];
		for (const link of this.parser.references) {
			const { topError, linkRange } = link;

			if (!topError || !linkRange) {
				continue;
			}

			const { originalError } = topError;

			// the `NotPromptFile` error is allowed because we allow users
			// to include non-prompt file links in the prompt files
			// note! this check also handles the `FolderReference` error
			if (originalError instanceof NotPromptFile) {
				continue;
			}

			markers.push(toMarker(link));
		}

		this.markerService.changeOne(
			MARKERS_OWNER_ID,
			this.model.uri,
			markers,
		);
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
const toMarker = (
	link: IPromptFileReference,
): IMarkerData => {
	const { topError, linkRange } = link;

	// a sanity check because this function must be
	// used only if these link attributes are present
	assertDefined(
		topError,
		'Top error must to be defined.',
	);
	assertDefined(
		linkRange,
		'Link range must to be defined.',
	);

	const { originalError } = topError;
	assert(
		!(originalError instanceof NotPromptFile),
		'Error must not be of "not prompt file" type.',
	);

	// `error` severity for the link itself, `warning` for any of its children
	const severity = (topError.errorSubject === 'root')
		? MarkerSeverity.Error
		: MarkerSeverity.Warning;

	return {
		message: topError.localizedMessage,
		severity,
		...linkRange,
	};
};

/**
 * The class that manages creation and disposal of {@link PromptLinkDiagnosticsProvider}
 * classes for each specific editor text model.
 */
export class PromptLinkDiagnosticsInstanceManager extends ProviderInstanceManagerBase<PromptLinkDiagnosticsProvider> {
	protected override readonly InstanceClass = PromptLinkDiagnosticsProvider;
}
