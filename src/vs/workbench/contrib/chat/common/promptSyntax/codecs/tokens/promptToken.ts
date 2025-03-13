/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../../../../../../editor/common/codecs/baseToken.js';

/**
 * Common base token that all chatbot `prompt` tokens should inherit from.
 */
export abstract class PromptToken extends BaseToken { }
