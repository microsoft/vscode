/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../../base/common/assert.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IPromptsService } from '../../../common/promptSyntax/service/types.js';
import { IPromptFileReference } from '../../../common/promptSyntax/parsers/types.js';
import { TextModelPromptParser } from '../../../common/promptSyntax/parsers/textModelPromptParser.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { FailedToResolveContentsStream, NotPromptFile, ParseError, RecursiveReference } from '../../../common/promptFileReferenceErrors.js';

/**
 * TODO: @legomushroom
 */
const MARKERS_OWNER_ID = 'reusable-prompts-syntax';

/**
 * TODO: @legomushroom
 */
// TODO: @lego - move under /common
export class MarkersProvider extends Disposable {
	/**
	 * TODO: @legomushroom
	 */
	private readonly parser: TextModelPromptParser;

	constructor(
		private readonly editor: ITextModel,
		@IMarkerService private readonly markerService: IMarkerService,
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
		super();

		this.parser = this.promptsService
			.getSyntaxParserFor(this.editor)
			.onUpdate(this.updateMarkers.bind(this))
			.onDispose(this.dispose.bind(this));

		// TODO @legomushroom - uncomment?
		// this.updateMarkers();
	}

	/**
	 * TODO: @legomushroom
	 */
	private async updateMarkers() {
		// ensure that parsing process is settled
		await this.parser.allSettled();

		// clean up all previously added markers
		this.markerService.remove(MARKERS_OWNER_ID, [this.editor.uri]);

		const markers: IMarkerData[] = [];
		for (const link of this.parser.allReferences) {
			const { errorCondition, linkRange } = link;

			if (!errorCondition || !linkRange) {
				continue;
			}

			// the `NotPromptFile` error is allowed because we allow users
			// to include non-prompt file links in the prompt files
			// note! this check also handles the `FolderReference` error
			if (errorCondition instanceof NotPromptFile) {
				continue;
			}

			markers.push(toMarker(link));
		}

		this.markerService.changeOne(
			MARKERS_OWNER_ID,
			this.editor.uri,
			markers,
		);
	}
}

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - add @throws info
const toMarker = (
	link: IPromptFileReference,
): IMarkerData => {
	const { errorCondition, linkRange } = link;

	// a sanity check because this function must be
	// used only if these attributes are present
	assertDefined(
		errorCondition,
		'Error condition must to be defined.',
	);
	assertDefined(
		linkRange,
		'Link range must to be defined.',
	);
	assert(
		!(errorCondition instanceof NotPromptFile),
		'Error must not be of "not prompt file" type.',
	);

	// `FailedToResolveContentsStream` error check takes into account the `OpenFailed` error too
	const severity = (errorCondition instanceof FailedToResolveContentsStream)
		? MarkerSeverity.Error
		: MarkerSeverity.Warning;

	return {
		message: getErrorMessage(errorCondition),
		severity,
		...linkRange,
	};
};

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - add @throws info
// TODO: @legomushroom - localize or reuse existing messages
const getErrorMessage = (
	error: ParseError,
): string => {
	// a sanity check because this function must be
	// used only if error has correct type
	assert(
		!(error instanceof NotPromptFile),
		'Error must not be of "not prompt file" type.',
	);

	// `FailedToResolveContentsStream` error takes into account the `OpenFailed` error too
	if (error instanceof FailedToResolveContentsStream) {
		return `The file '${error.uri.fsPath}' is not found.`;
	}

	if (error instanceof RecursiveReference) {
		return 'The file contains recursive child reference that will be ignored.';
	}

	return `An unexpected error occurred: ${error.message}`;
};
