/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { URI } from 'vs/base/common/uri';

export class SimpleClipboardService implements IClipboardService {

	_serviceBrand: any;

	writeText(text: string, type?: string): void { }

	readText(type?: string): string {
		return undefined;
	}

	readFindText(): string {
		return undefined;
	}

	writeFindText(text: string): void { }

	writeResources(resources: URI[]): void { }

	readResources(): URI[] {
		return [];
	}

	hasResources(): boolean {
		return false;
	}
}