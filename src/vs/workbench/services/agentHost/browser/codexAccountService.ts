/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Action, IAction, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY, CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY, ICodexAccountInfo, readCodexAccountInfo } from '../../../../platform/agentHost/common/codexAccount.js';
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId, IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../platform/agentHost/common/state/sessionState.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';

interface ICodexAccountVisibilityConfiguration {
	getValue<T>(section: string): T | undefined;
}

export const ICodexAccountService = createDecorator<ICodexAccountService>('codexAccountService');

export interface ICodexAccountService {
	readonly _serviceBrand: undefined;
	readonly account: ICodexAccountInfo;
	readonly onDidChangeAccount: Event<ICodexAccountInfo>;
	signIn(): void;
	signOut(): void;
}

export function hasSignedInCodexChatGPTAccount(account: ICodexAccountInfo, visible = true): boolean {
	return visible && account.status === 'signedIn';
}

export function shouldShowCodexAccount(configurationService: ICodexAccountVisibilityConfiguration, isSessionsWindow: boolean): boolean {
	return configurationService.getValue<boolean>(ChatAIDisabledSettingId) !== true
		&& configurationService.getValue<boolean>(AgentHostCodexAgentEnabledSettingId) === true
		&& (isSessionsWindow || configurationService.getValue<boolean>(CodexPreferAgentHostEditorSettingId) === true);
}

export function createCodexAccountMenuActions(service: ICodexAccountService, visible = true): IAction[] {
	if (!visible) {
		return [];
	}
	const account = service.account;
	if (account.status === 'signedIn') {
		const signOut = toAction({
			id: 'codex.signOutOfChatGPT',
			label: localize('signOutOfChatGPT', "Sign Out"),
			run: () => service.signOut(),
		});
		const accountLabel = account.email
			? localize('chatGPTAccountWithProvider', "{0} (ChatGPT)", account.email)
			: localize('chatGPTAccount', "ChatGPT");
		return [new SubmenuAction('codex.chatgptAccount', accountLabel, [signOut])];
	}
	if (account.status === 'downloading') {
		return [new Action('codex.downloadingAgent', localize('downloadingCodexAgent', "Downloading Codex agent…"), undefined, false)];
	}
	if (account.status === 'unknown' || account.status === 'signedOut' || account.status === 'error') {
		return [new Action('codex.signInToChatGPT', localize('signInToChatGPT', "Sign in to ChatGPT"), undefined, true, () => service.signIn())];
	}
	return [];
}

export function openCodexAuthUrl(openerService: Pick<IOpenerService, 'open'>, authUrl: string): Promise<boolean> {
	return openerService.open(authUrl, { openExternal: true, skipValidation: true });
}

class CodexAccountService extends Disposable implements ICodexAccountService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeAccount = this._register(new Emitter<ICodexAccountInfo>());
	readonly onDidChangeAccount = this._onDidChangeAccount.event;

	private readonly _pendingSignInRequests = new Set<string>();
	private _account: ICodexAccountInfo;

	get account(): ICodexAccountInfo {
		return this._account;
	}

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super();
		const initialState = this._agentHostService.rootState.value;
		this._account = readCodexAccountInfo(initialState instanceof Error ? undefined : initialState);
		this._register(this._agentHostService.rootState.onDidChange(state => this._updateAccount(readCodexAccountInfo(state))));
	}

	signIn(): void {
		const request = generateUuid();
		this._pendingSignInRequests.add(request);
		this._agentHostService.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY]: request },
		});
	}

	signOut(): void {
		this._agentHostService.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY]: generateUuid() },
		});
	}

	private _updateAccount(account: ICodexAccountInfo): void {
		this._account = account;
		this._onDidChangeAccount.fire(account);
		if (account.authUrlNonce && this._pendingSignInRequests.delete(account.authUrlNonce) && account.authUrl) {
			void openCodexAuthUrl(this._openerService, account.authUrl);
		}
	}
}

registerSingleton(ICodexAccountService, CodexAccountService, InstantiationType.Delayed);
