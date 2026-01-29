/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

export interface ISlideshowImage {
	readonly id: string;
	readonly name: string;
	readonly mimeType: string;
	readonly data: VSBuffer;
	readonly uri?: URI;
	readonly source?: string;
}

export interface ISlideshowImageCollection {
	readonly id: string;
	readonly title: string;
	readonly images: ReadonlyArray<ISlideshowImage>;
}
