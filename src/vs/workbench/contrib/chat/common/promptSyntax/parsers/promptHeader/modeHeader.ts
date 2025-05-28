/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type TDehydrated } from './headerBase.js';
import { TInstructionsMetadata } from './instructionsHeader.js';
import { PromptsType } from '../../../../../../../platform/prompts/common/prompts.js';
import { PromptHeader, type IPromptMetadata, type TPromptMetadata } from './promptHeader.js';

/**
 * Metadata utility object for mode files.
 */
interface IModeMetadata extends IPromptMetadata { }

/**
 * Metadata for mode files.
 */
export type TModeMetadata = Partial<TDehydrated<IModeMetadata>> & { promptType: PromptsType.mode };

/**
 * Metadata defined in the header of prompt/instruction/mode files.
 */
// TODO: @legomushroom - move to header base class?
export type TMetadata = TPromptMetadata | TModeMetadata | TInstructionsMetadata;

/**
 * Header object for mode files.
 */
export class ModeHeader extends PromptHeader { }
