/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITopError } from './types.js';
import { localize } from '../../../../../../nls.js';
import { assert } from '../../../../../../base/common/assert.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { OpenFailed, RecursiveReference, FailedToResolveContentsStream } from '../../promptFileReferenceErrors.js';

/**
 * TODO: @lego
 */
export class TopError implements ITopError {
	public readonly errorSubject = this.options.errorSubject;
	public readonly originalError = this.options.originalError;
	public readonly errorsCount = this.options.errorsCount;
	public readonly parentUri = this.options.parentUri;

	constructor(
		private readonly options: Omit<ITopError, 'localizedMessage'>,
	) { }


	public get localizedMessage(): string {
		// TODO: @legomushroom - update localization IDs
		const { originalError, parentUri, errorSubject: subject, errorsCount } = this;

		assert(
			errorsCount >= 1,
			`Error count must be at least 1, got '${errorsCount}'.`,
		);

		// a note about how many more link issues are there
		const moreIssuesNote = (errorsCount > 1)
			? localize('chatPromptInstructionsBrokenReferenceSuffix222222', "\n(+{0} more issues)", errorsCount - 1)
			: '';

		if (subject === 'root') {
			if (originalError instanceof OpenFailed) {
				return localize(
					'chatPromptInstructionsFileOpenFailed111',
					"Cannot open '{0}'.{1}",
					originalError.uri.path,
					moreIssuesNote,
				);
			}

			if (originalError instanceof FailedToResolveContentsStream) {
				return localize(
					'chatPromptInstructionsStreamOpenFailed1111',
					"Cannot read '{0}'.{1}",
					originalError.uri.path,
					moreIssuesNote,
				);
			}

			if (originalError instanceof RecursiveReference) {
				return localize(
					'chatPromptInstructionsSelfRecursion4444',
					"Recursion to itself.",
				);
			}

			return originalError.message + moreIssuesNote;
		}

		// a sanity check - because the error subject is not `root`, the parent must set
		assertDefined(
			parentUri,
			'Parent URI must be defined for error of non-root link.',
		);

		const errorMessageStart = (subject === 'child')
			? localize('chatPromptInstructionsBrokenReferenceFile', "Contains")
			: localize(
				'chatPromptInstructionsBrokenChildReference',
				"Indirectly referenced prompt '{0}' contains",
				parentUri.path,
			);

		const linkIssueName = (originalError instanceof RecursiveReference)
			? localize('chatPromptInstructionsBrokenChildRecursiveLink', "recursive")
			: localize('chatPromptInstructionsBrokenChildBrokenLink', "broken");

		return localize(
			'chatPromptInstructionsBrokenReference111',
			"{0} a {1} link to '{2}' that will be ignored.{3}",
			errorMessageStart,
			linkIssueName,
			originalError.uri.path,
			moreIssuesNote,
		);
	}
}
