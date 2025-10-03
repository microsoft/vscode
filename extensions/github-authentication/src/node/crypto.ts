/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webcrypto } from 'crypto';

// eslint-disable-next-line local/code-no-any-casts
export const crypto = webcrypto as any as Crypto;
