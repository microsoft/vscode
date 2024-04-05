/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as postcss from 'postcss';
import * as File from 'vinyl';
import * as es from 'event-stream';

export function gulpPostcss(plugins: postcss.AcceptedPlugin[], handleError?: (err: Error) => void) {
	const instance = postcss(plugins);

	return es.map((file: File, callback: (error?: any, file?: any) => void) => {
		if (file.isNull()) {
			return callback(null, file);
		}

		if (file.isStream()) {
			return callback(new Error('Streaming not supported'));
		}

		instance
			.process(file.contents.toString(), { from: file.path })
			.then((result) => {
				file.contents = Buffer.from(result.css);
				callback(null, file);
			})
			.catch((error) => {
				if (handleError) {
					handleError(error);
					callback();
				} else {
					callback(error);
				}
			});
	});
}
