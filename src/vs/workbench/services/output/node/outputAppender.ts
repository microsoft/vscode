/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createRotatingLogger } from 'vs/platform/log/node/spdlogService';
import { RotatingLogger } from 'spdlog';
import { ByteSize } from 'vs/platform/files/common/files';

export class OutputAppender {

	private appender: RotatingLogger;

	constructor(name: string, readonly file: string) {
		this.appender = createRotatingLogger(name, file, 30 * ByteSize.MB, 1);
		this.appender.clearFormatters();
	}

	append(content: string): void {
		this.appender.critical(content);
	}

	flush(): void {
		this.appender.flush();
	}
}
