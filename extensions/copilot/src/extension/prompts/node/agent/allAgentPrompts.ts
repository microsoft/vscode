/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './anthropicPrompts';
import './familyHPrompts';
import './geminiPrompts';
import './minimaxPrompts';
import './vscModelPrompts';
// vscModelPrompts must be imported before gpt5Prompt to ensure VSC model prompt resolvers are registered first.
import './openai/defaultOpenAIPrompt';
import './openai/gpt51CodexPrompt';
import './openai/gpt51Prompt';
import './openai/gpt52Prompt';
import './openai/gpt53CodexPrompt';
import './openai/gpt54ConcisePrompt';
import './openai/gpt54LargePrompt';
import './openai/gpt54Prompt';
import './openai/gpt5CodexPrompt';
import './openai/gpt5Prompt';
import './openai/hiddenModelBPrompt';
import './xAIPrompts';
import './zaiPrompts';

