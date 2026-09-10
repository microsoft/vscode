/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isOpenAIModel } from '../../../../../platform/endpoint/common/chatModelCapabilities';
import { PromptRegistry } from '../promptRegistry';
import { Gpt56PromptResolver as LatestOpenAIPromptResolver } from './gpt56Prompt';

// Promote the entire prompt bundle by changing the resolver imported above.
PromptRegistry.registerFallbackPrompt(LatestOpenAIPromptResolver, isOpenAIModel);
