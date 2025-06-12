/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../../../../editor/common/model.js';
import { ObjectStream } from './objectStream.js';
import { VSBuffer } from '../../../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../../../base/common/cancellation.js';

/**
 * Create new instance of the stream from a provided text model.
 */
export function objectStreamFromTextModel(
	model: ITextModel,
	cancellationToken?: CancellationToken,
): ObjectStream<VSBuffer> {
	return new ObjectStream(modelToGenerator(model), cancellationToken);
}

/**
 * Create a generator out of a provided text model.
 */
function modelToGenerator(model: ITextModel): Generator<VSBuffer, undefined> {
	return (function* (): Generator<VSBuffer, undefined> {
		const totalLines = model.getLineCount();
		let currentLine = 1;

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
}
