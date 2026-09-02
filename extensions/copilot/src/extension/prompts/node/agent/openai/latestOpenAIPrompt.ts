/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isOpenAIModel } from '../../../../../platform/endpoint/common/chatModelCapabilities';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { PromptRegistry } from '../promptRegistry';
import { Gpt56PromptResolver as LatestOpenAIPromptResolver } from './gpt56Prompt';

function usesLatestOpenAIPrompt(endpoint: IChatEndpoint): boolean {
	if (!isOpenAIModel(endpoint)) {
		return false;
	}

	const family = endpoint.family.toLowerCase();
	const versionMatch = /^gpt-(?<major>\d+)(?:\.(?<minor>\d+))?(?:-|$)/.exec(family);
	if (!versionMatch) {
		return !family.startsWith('gpt-');
	}

	const major = Number(versionMatch.groups?.major);
	const minor = Number(versionMatch.groups?.minor ?? 0);
	return major > 5 || (major === 5 && minor > 6);
}

// Promote the entire prompt bundle by changing the resolver imported above.
PromptRegistry.registerFallbackPrompt(LatestOpenAIPromptResolver, usesLatestOpenAIPrompt, 'gpt-5.6');
