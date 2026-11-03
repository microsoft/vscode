/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test, vi } from 'vitest';
import { speech } from 'vscode';
import type { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import type { CopilotToken } from '../../../../platform/authentication/common/copilotToken';
import type { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import type { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import type { ILogService } from '../../../../platform/log/common/logService';
import type { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { Emitter } from '../../../../util/vs/base/common/event';
import type { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';

const registeredProviders = vi.hoisted(() => new Set<string>());
const registeredVoiceProviders = vi.hoisted(() => new Set<string>());

vi.mock('vscode', async importOriginal => ({
	...await importOriginal<object>(),
	ChatHookType: undefined,
	ChatRequest: undefined,
	LanguageModelToolInformation: undefined,
	Extension: undefined,
	ChatMcpToolInvocationData: undefined,
	LanguageModelChatApiType: undefined,
	lm: {
		registerLanguageModelChatProvider: (id: string) => {
			registeredProviders.add(id);
			return { dispose: () => registeredProviders.delete(id) };
		},
	},
	speech: {
		registerVoiceLiveSessionProvider: vi.fn((id: string) => {
			registeredVoiceProviders.add(id);
			return { dispose: () => registeredVoiceProviders.delete(id) };
		}),
	},
}));

import { BYOKContrib } from '../byokContribution';

describe('BYOKContrib', () => {
	test.each([true, false])('re-registers providers without churning on token resets (speech enabled: %s)', speechEnabled => {
		const registrationError = new Error('Extension \'GitHub.copilot-chat\' CANNOT use API proposal: speech.');
		if (!speechEnabled) {
			vi.mocked(speech.registerVoiceLiveSessionProvider).mockImplementationOnce(() => {
				throw registrationError;
			});
		}
		const onDidAuthenticationChange = new Emitter<void>();
		const onDidCopilotTokenChange = new Emitter<void>();
		const authService = {
			anyGitHubSession: { account: { id: 'user' } },
			copilotToken: undefined as Omit<CopilotToken, 'token'> | undefined,
			onDidAuthenticationChange: onDidAuthenticationChange.event,
			onDidCopilotTokenChange: onDidCopilotTokenChange.event,
		};
		const instantiationService = { createInstance: () => ({ updateKnownModels: () => { } }) } as unknown as IInstantiationService;
		const fetcherService = { fetch: () => Promise.reject(new Error('offline')) } as unknown as IFetcherService;
		const logError = vi.fn();
		const logService = { info: () => { }, warn: () => { }, error: logError } as unknown as ILogService;
		const configurationService = { getNonExtensionConfig: () => undefined } as unknown as IConfigurationService;
		const contrib = new BYOKContrib(fetcherService, logService, {} as IVSCodeExtensionContext, authService as unknown as IAuthenticationService, instantiationService, configurationService);

		const states = [{ languageModelProviders: registeredProviders.size, voiceLiveProviders: registeredVoiceProviders.size }];
		authService.copilotToken = { isInternal: false, isIndividual: true, isClientBYOKEnabled: () => false } as unknown as Omit<CopilotToken, 'token'>;
		onDidCopilotTokenChange.fire();
		states.push({ languageModelProviders: registeredProviders.size, voiceLiveProviders: registeredVoiceProviders.size });
		authService.copilotToken = undefined;
		onDidCopilotTokenChange.fire();
		states.push({ languageModelProviders: registeredProviders.size, voiceLiveProviders: registeredVoiceProviders.size });
		onDidAuthenticationChange.fire();
		states.push({ languageModelProviders: registeredProviders.size, voiceLiveProviders: registeredVoiceProviders.size });

		contrib.dispose();
		states.push({ languageModelProviders: registeredProviders.size, voiceLiveProviders: registeredVoiceProviders.size });
		onDidAuthenticationChange.dispose();
		onDidCopilotTokenChange.dispose();
		const voiceLiveProviders = speechEnabled ? 1 : 0;
		expect({ states, errors: logError.mock.calls }).toEqual({
			states: [
				{ languageModelProviders: 0, voiceLiveProviders },
				{ languageModelProviders: 9, voiceLiveProviders },
				{ languageModelProviders: 9, voiceLiveProviders },
				{ languageModelProviders: 0, voiceLiveProviders },
				{ languageModelProviders: 0, voiceLiveProviders: 0 },
			],
			errors: speechEnabled ? [] : [[registrationError, 'BYOK: failed to register GPT-Live voice provider.']],
		});
	});
});
