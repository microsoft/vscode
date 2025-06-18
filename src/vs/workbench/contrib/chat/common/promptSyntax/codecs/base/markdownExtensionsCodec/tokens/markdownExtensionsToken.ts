/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownToken } from '../../markdownCodec/tokens/markdownToken.js';

/**
 * Base class for all tokens produced by the `MarkdownExtensionsDecoder`.
 */
export abstract class MarkdownExtensionsToken extends MarkdownToken {}
