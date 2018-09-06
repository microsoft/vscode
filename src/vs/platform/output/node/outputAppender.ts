/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createRotatingLogger } from 'vs/platform/log/node/spdlogService';
import { RotatingLogger } from 'spdlog';

interface Appender {
	critical(content: string);
	flush();
}

export class OutputAppender {

	private appender: Appender;

	constructor(name: string, file: string) {
		// Do not crash if logger cannot be loaded
		try {
			this.appender = createRotatingLogger(name, file, 1024 * 1024 * 30, 1);
			(<RotatingLogger>this.appender).clearFormatters();
		} catch (error) {
			console.error(error);
			this.appender = {
				critical() { },
				flush() { },
			};
		}
	}

	append(content: string): void {
		this.appender.critical(content);
	}

	flush(): void {
		this.appender.flush();
	}
}