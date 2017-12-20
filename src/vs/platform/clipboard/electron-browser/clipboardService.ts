/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { clipboard } from 'electron';
import * as platform from 'vs/base/common/platform';

export class ClipboardService implements IClipboardService {

	_serviceBrand: any;

	public writeText(text: string): void {
		clipboard.writeText(text);
	}

	public readText(): string {
		return clipboard.readText();
	}

	public readFindText(): string {
		if (platform.isMacintosh) {
			return clipboard.readFindText();
		}
		return '';
	}

	public writeFindText(text: string): void {
		if (platform.isMacintosh) {
			clipboard.writeFindText(text);
		}
	}
}
