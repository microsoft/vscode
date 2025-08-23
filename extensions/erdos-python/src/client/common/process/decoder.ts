// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as iconv from 'iconv-lite';
import { DEFAULT_ENCODING } from './constants';

export function decodeBuffer(buffers: Buffer[], encoding: string = DEFAULT_ENCODING): string {
    encoding = iconv.encodingExists(encoding) ? encoding : DEFAULT_ENCODING;
    return iconv.decode(Buffer.concat(buffers), encoding);
}
