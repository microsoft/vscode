/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test, vi } from 'vitest';
import type { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import type { CopilotToken } from '../../../../platform/authentication/common/copilotToken';
import type { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import type { ILogService } from '../../../../platform/log/common/logService';
import type { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { Emitter } from '../../../../util/vs/base/common/event';
import type { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';

const registeredProviders = vi.hoisted(() => new Set<string>());

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
}));

import { BYOKContrib } from '../byokContribution';

describe('BYOKContrib', () => {
	test('re-registers providers once a Copilot token arrives, without churning on token resets', () => {
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
		const logService = { info: () => { }, warn: () => { } } as unknown as ILogService;
		const contrib = new BYOKContrib(fetcherService, logService, {} as IVSCodeExtensionContext, authService as unknown as IAuthenticationService, instantiationService);

		const states: number[] = [registeredProviders.size];
		authService.copilotToken = { isInternal: false, isIndividual: true, isClientBYOKEnabled: () => false } as unknown as Omit<CopilotToken, 'token'>;
		onDidCopilotTokenChange.fire();
		states.push(registeredProviders.size);
		authService.copilotToken = undefined;
		onDidCopilotTokenChange.fire();
		states.push(registeredProviders.size);
		onDidAuthenticationChange.fire();
		states.push(registeredProviders.size);

		contrib.dispose();
		onDidAuthenticationChange.dispose();
		onDidCopilotTokenChange.dispose();
		expect(states).toEqual([0, 9, 9, 0]);
	});
});
