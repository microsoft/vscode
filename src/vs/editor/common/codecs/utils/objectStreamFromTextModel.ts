/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../model.js';
import { ObjectStream } from './objectStream.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

/**
 * Create new instance of the stream from a provided text model.
 */
export function objectStreamFromTextModel(
	model: ITextModel,
	startLineNumber: number = 1,
	cancellationToken?: CancellationToken,
): ObjectStream<VSBuffer> {
	return new ObjectStream(modelToGenerator(model, startLineNumber), cancellationToken);
}

/**
 * Create a generator out of a provided text model.
 */
// TODO: @legomushroom - make private?
export const modelToGenerator = (
	model: ITextModel,
	startLineNumber: number = 1,
): Generator<VSBuffer, undefined> => {
	// TODO: @legomushroom - validate `startLineNumber` argument

	return (function* (): Generator<VSBuffer, undefined> {
		const totalLines = model.getLineCount();
		let currentLine = startLineNumber;

		while (currentLine <= totalLines) {
			if (model.isDisposed()) {
				return undefined;
			}

			yield VSBuffer.fromString(
				model.getLineContent(currentLine),
			);
			if (currentLine !== totalLines) {
				yield VSBuffer.fromString(
					model.getEOL(),
				);
			}

			currentLine++;
		}
	})();
};
