/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RotatingLogger } from 'spdlog';

export class OutputAppender {

	private appender: RotatingLogger;

	constructor(name: string, file: string) {
		this.appender = new RotatingLogger(name, file, 1024 * 1024 * 30, 1);
		this.appender.clearFormatters();
	}

	append(content: string): void {
		this.appender.critical(content);
	}

	flush(): void {
		this.appender.flush();
	}

}