/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Action, IAction, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY, CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY, MAX_CODEX_PROFILE_IMAGE_BYTES, readCodexAccountInfo, type ICodexAccountInfo, type ICodexProfileImageReference } from '../../../../platform/agentHost/common/codexAccount.js';
import { CODEX_AGENT_PROVIDER_ID } from '../../../../platform/agentHost/common/agent.js';
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId, IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { ContentEncoding } from '../../../../platform/agentHost/common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../../../../platform/agentHost/common/state/sessionState.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';

interface ICodexAccountVisibilityConfiguration {
	getValue<T>(section: string): T | undefined;
}

export const ICodexAccountService = createDecorator<ICodexAccountService>('codexAccountService');

export interface ICodexAccountViewInfo extends ICodexAccountInfo {
	readonly profileImageDataUri?: string;
}

export interface ICodexAccountService {
	readonly _serviceBrand: undefined;
	/**
	 * The agent whose account this service manages, so callers that dispatch by
	 * agent id — the SDK setup banner's Sign In button — can check they are
	 * talking to the right service without carrying a literal `'codex'`.
	 */
	readonly agent: string;
	readonly account: ICodexAccountViewInfo;
	readonly onDidChangeAccount: Event<ICodexAccountViewInfo>;
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

export async function readCodexProfileImageDataUri(
	connection: Pick<IAgentHostService, 'resourceRead'>,
	reference: ICodexProfileImageReference,
): Promise<string | undefined> {
	try {
		const result = await connection.resourceRead(URI.parse(reference.uri), ContentEncoding.Base64);
		if (result.encoding !== ContentEncoding.Base64
			|| !isMatchingProfileImageContentType(result.contentType, reference.contentType)
			|| result.data.length > Math.ceil(MAX_CODEX_PROFILE_IMAGE_BYTES * 4 / 3) + 4
			|| !isBase64(result.data)
			|| getBase64DecodedSize(result.data) !== reference.sizeHint) {
			return undefined;
		}
		return `data:${reference.contentType};base64,${result.data}`;
	} catch {
		return undefined;
	}
}

export class CodexAccountService extends Disposable implements ICodexAccountService {
	declare readonly _serviceBrand: undefined;

	readonly agent = CODEX_AGENT_PROVIDER_ID;

	private readonly _onDidChangeAccount = this._register(new Emitter<ICodexAccountViewInfo>());
	readonly onDidChangeAccount = this._onDidChangeAccount.event;

	private readonly _pendingSignInRequests = new Set<string>();
	private _rootAccount: ICodexAccountInfo;
	private _account: ICodexAccountViewInfo;
	private _profileImageKey: string | undefined;
	private _profileImageRequest = 0;

	get account(): ICodexAccountViewInfo {
		return this._account;
	}

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super();
		const initialState = this._agentHostService.rootState.value;
		this._rootAccount = readCodexAccountInfo(initialState instanceof Error ? undefined : initialState);
		this._account = this._rootAccount;
		this._updateProfileImage(this._rootAccount.profileImage);
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
		this._rootAccount = account;
		const profileImageKey = getProfileImageKey(account.profileImage);
		this._account = profileImageKey === this._profileImageKey
			? { ...account, profileImageDataUri: this._account.profileImageDataUri }
			: account;
		this._onDidChangeAccount.fire(this._account);
		this._updateProfileImage(account.profileImage);
		if (account.authUrlNonce && this._pendingSignInRequests.delete(account.authUrlNonce) && account.authUrl) {
			void openCodexAuthUrl(this._openerService, account.authUrl);
		}
	}

	private _updateProfileImage(reference: ICodexProfileImageReference | undefined): void {
		const profileImageKey = getProfileImageKey(reference);
		if (profileImageKey === this._profileImageKey) {
			return;
		}
		this._profileImageKey = profileImageKey;
		const request = ++this._profileImageRequest;
		if (!reference) {
			return;
		}
		void readCodexProfileImageDataUri(this._agentHostService, reference).then(profileImageDataUri => {
			if (request !== this._profileImageRequest || profileImageKey !== this._profileImageKey) {
				return;
			}
			if (!profileImageDataUri) {
				this._profileImageKey = undefined;
				return;
			}
			this._account = { ...this._rootAccount, profileImageDataUri };
			this._onDidChangeAccount.fire(this._account);
		});
	}
}

function isMatchingProfileImageContentType(actual: string | undefined, expected: string): boolean {
	return actual === expected || (actual === 'image/jpg' && expected === 'image/jpeg');
}

function getProfileImageKey(reference: ICodexProfileImageReference | undefined): string | undefined {
	return reference ? `${reference.uri}\0${reference.contentType}\0${reference.sizeHint}\0${reference.nonce}` : undefined;
}

function isBase64(value: string): boolean {
	return value.length > 0
		&& value.length % 4 === 0
		&& /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function getBase64DecodedSize(value: string): number {
	return value.length * 3 / 4 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
}

registerSingleton(ICodexAccountService, CodexAccountService, InstantiationType.Delayed);
