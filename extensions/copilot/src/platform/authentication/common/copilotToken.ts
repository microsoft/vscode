/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotUserQuotaInfo } from '../../chat/common/chatQuotaService';
import { vArray, vBoolean, vEnum, vNullable, vNumber, vObj, vRequired, vString } from '../../configuration/common/validator';

/**
 * A function used to determine if the org list contains an internal organization
 * @param orgList The list of organizations the user is a member of
 * Whether or not it contains an internal org
 */
export function containsInternalOrg(orgList: string[]): boolean {
	return containsGitHubOrg(orgList) || containsMicrosoftOrg(orgList);
}

/**
 * A function used to determine if the org list contains a GitHub organization
 * @param orgList The list of organizations the user is a member of
 * Whether or not it contains a GitHub org
 */
function containsGitHubOrg(orgList: string[]): boolean {
	const GITHUB_ORGANIZATIONS = ['4535c7beffc844b46bb1ed4aa04d759a'];
	// Check if the user is part of an allowed organization.
	for (const org of orgList) {
		if (GITHUB_ORGANIZATIONS.includes(org)) {
			return true;
		}
	}
	return false;
}

/**
 * A function used to determine if the org list contains a Microsoft organization
 * @param orgList The list of organizations the user is a member of
 * Whether or not it contains a Microsoft org
 */
function containsMicrosoftOrg(orgList: string[]): boolean {
	const MICROSOFT_ORGANIZATIONS = ['a5db0bcaae94032fe715fb34a5e4bce2', '7184f66dfcee98cb5f08a1cb936d5225',
		'1cb18ac6eedd49b43d74a1c5beb0b955', 'ea9395b9a9248c05ee6847cbd24355ed'];
	// Check if the user is part of a Microsoft organization.
	for (const org of orgList) {
		if (MICROSOFT_ORGANIZATIONS.includes(org)) {
			return true;
		}
	}
	return false;
}

/**
 * A function used to determine if the org list contains a VS Code organization
 * @param orgList The list of organizations the user is a member of
 * Whether or not it contains a VS Code org
 */
export function containsVSCodeOrg(orgList: string[]): boolean {
	const VSCODE_ORGANIZATIONS = ['551cca60ce19654d894e786220822482'];
	// Check if the user is part of a VS Code organization.
	for (const org of orgList) {
		if (VSCODE_ORGANIZATIONS.includes(org)) {
			return true;
		}
	}
	return false;
}

export class CopilotToken {
	private readonly tokenMap: Map<string, string>;
	constructor(private readonly _info: ExtendedTokenInfo) {
		this.tokenMap = this.parseToken(_info.token);
	}

	private parseToken(token: string): Map<string, string> {
		const result = new Map<string, string>();
		const firstPart = token?.split(':')[0];
		const fields = firstPart?.split(';');
		for (const field of fields) {
			const [key, value] = field.split('=');
			result.set(key, value);
		}
		return result;
	}

	get token(): string {
		return this._info.token;
	}

	get sku(): CopilotSku | undefined {
		return this._info.sku;
	}

	/**
	 * Evaluates `has_cfi_access?` which is defined as `!has_cfb_access? && !has_cfe_access?`
	 * (cfb = copilot for business, cfe = copilot for enterprise).
	 * So it's also true for copilot free users.
	 */
	get isIndividual(): boolean {
		return this._info.individual ?? false;
	}

	get organizationList(): string[] {
		return this._info.organization_list || [];
	}

	/**
	 * Returns the list of organization logins that provide Copilot access to the user.
	 * These are the organizations through which the user has a Copilot subscription (Business/Enterprise).
	 */
	get organizationLoginList(): string[] {
		return this._info.organization_login_list || [];
	}

	get enterpriseList(): number[] {
		return this._info.enterprise_list || [];
	}

	get endpoints(): Endpoints | undefined {
		return this._info.endpoints;
	}

	get isInternal() {
		return containsInternalOrg(this.organizationList);
	}

	get isMicrosoftInternal(): boolean {
		return containsMicrosoftOrg(this.organizationList);
	}

	get isGitHubInternal(): boolean {
		return containsGitHubOrg(this.organizationList);
	}

	get isFreeUser(): boolean {
		return this.sku === 'free_limited_copilot';
	}

	get isNoAuthUser(): boolean {
		return this.sku === 'no_auth_limited_copilot';
	}

	get isChatQuotaExceeded(): boolean {
		return this.isFreeUser && (this._info.limited_user_quotas?.chat ?? 1) <= 0;
	}

	get isCompletionsQuotaExceeded(): boolean {
		return this.isFreeUser && (this._info.limited_user_quotas?.completions ?? 1) <= 0;
	}

	get codeQuoteEnabled(): boolean {
		return this._info.code_quote_enabled ?? false;
	}

	get isVscodeTeamMember(): boolean {
		return this._info.isVscodeTeamMember || containsVSCodeOrg(this.organizationList);
	}

	get codexAgentEnabled(): boolean {
		return this._info.codex_agent_enabled ?? false;
	}

	get copilotPlan(): 'free' | 'individual' | 'individual_pro' | 'business' | 'enterprise' {
		if (this.isFreeUser) {
			return 'free';
		}
		const plan = this._info.copilot_plan;
		switch (plan) {
			case 'individual':
			case 'individual_pro':
			case 'business':
			case 'enterprise':
				return plan;
			default:
				// Default to 'individual' for unexpected values
				return 'individual';
		}
	}

	get quotaInfo() {
		return { quota_snapshots: this._info.quota_snapshots, quota_reset_date: this._info.quota_reset_date };
	}

	get username(): string {
		return this._info.username;
	}

	private _isTelemetryEnabled: boolean | undefined;
	isTelemetryEnabled(): boolean {
		if (this._isTelemetryEnabled === undefined) {
			this._isTelemetryEnabled = this._info.telemetry === 'enabled';
		}
		return this._isTelemetryEnabled;
	}

	private _isPublicSuggestionsEnabled: boolean | undefined;
	isPublicSuggestionsEnabled(): boolean {
		if (this._isPublicSuggestionsEnabled === undefined) {
			this._isPublicSuggestionsEnabled = this._info.public_suggestions === 'enabled';
		}
		return this._isPublicSuggestionsEnabled;
	}

	isCopilotIgnoreEnabled(): boolean {
		return this._info.copilotignore_enabled ?? false;
	}

	get isCopilotCodeReviewEnabled(): boolean {
		return this._info.code_review_enabled ?? (this.getTokenValue('ccr') === '1');
	}

	isEditorPreviewFeaturesEnabled(): boolean {
		// Editor preview features are disabled if the flag is present and set to 0
		return this.getTokenValue('editor_preview_features') !== '0';
	}

	isMcpEnabled(): boolean {
		// MCP is disabled if the flag is present and set to 0
		return this.getTokenValue('mcp') !== '0';
	}

	isClientBYOKEnabled(): boolean {
		return this.getTokenValue('client_byok') === '1';
	}

	getTokenValue(key: string): string | undefined {
		return this.tokenMap.get(key);
	}

	isExpandedClientSideIndexingEnabled(): boolean {
		return this._info.blackbird_clientside_indexing === true;
	}

	isFcv1(): boolean {
		return this.tokenMap.get('fcv1') === '1';
	}

	/**
	 * Is snippy in blocking mode
	 */
	isSn(): boolean {
		return this.tokenMap.get('sn') === '1';
	}
}

/**
 * Details of the user's telemetry consent status we get from the server during token retrieval.
 *
 * `unconfigured` is a transitional state for pre-GA that indicates the user is in the Technical Preview
 * and needs to be asked about telemetry consent client-side. It can be removed post-GA as the server
 * will never return it again.
 *
 * `enabled` indicates that they agreed to full telemetry.
 *
 * `disabled` indicates that they opted out of full telemetry so we can only send the core messages
 * that users cannot opt-out of.
 *
 */
export type UserTelemetryChoice = 'enabled' | 'disabled';

/**
 * A notification we get from the server during token retrieval. Needs to be presented to the user.
 * Used for both success notifications (user_notification) and error notifications (error_details).
 */
export interface NotificationEnvelope {
	message: string;
	notification_id: TokenErrorNotificationId | string;
	title: string;
	url: string;
}

//#region CopilotSku Types

/**
 * Well-known SKU values that are checked in source code.
 * The actual SKU can be any string - these are just the ones we explicitly handle.
 */
export type WellKnownSku =
	| 'free_limited_copilot'
	| 'no_auth_limited_copilot';

/**
 * User's access type/SKU from the Copilot token endpoint.
 * This is a string that can be any SKU value - use WellKnownSku for type-safe comparisons.
 */
export type CopilotSku = WellKnownSku | string;

//#endregion

//#region Endpoints

export interface Endpoints {
	api?: string;
	'origin-tracker'?: string;
	proxy?: string;
	telemetry?: string;
}

//#endregion

/**
 * A server response containing a Copilot token and metadata associated with it.
 * This is the success response (HTTP 200) from the /copilot_internal/v2/token endpoint.
 */
export interface TokenEnvelope {
	// Required fields
	/** HMAC-signed token for Copilot proxy authentication. v2 format: fields:mac where fields are ';' separated key=value pairs. */
	token: string;
	/** Unix timestamp (seconds) when token expires. */
	expires_at: number;
	/** Seconds until client should request a new token. */
	refresh_in: number;
	/** User's access type/SKU. */
	sku: CopilotSku;
	/** Whether user has Copilot Individual access. */
	individual: boolean;

	// Feature flags
	/** Whether client-side indexing for Blackbird is enabled. */
	blackbird_clientside_indexing: boolean;
	/** Whether code quote/citation is enabled. */
	code_quote_enabled: boolean;
	/** Whether Copilot code review is enabled. */
	code_review_enabled: boolean;
	/** Whether code search is enabled. */
	codesearch: boolean;
	/** Whether content exclusion (.copilotignore) is enabled. */
	copilotignore_enabled: boolean;
	/** Whether VS Code electron fetcher v2 is enabled. */
	vsc_electron_fetcher_v2: boolean;

	// Consent settings
	/** 'enabled', 'disabled', or 'unconfigured' for public code suggestions. */
	public_suggestions: 'enabled' | 'disabled' | 'unconfigured';
	/** 'enabled' or 'disabled' for telemetry. */
	telemetry: 'enabled' | 'disabled';

	// Optional fields
	/** SKU-isolated endpoints. */
	endpoints?: Endpoints;
	/** Enterprise IDs if user has enterprise access. */
	enterprise_list?: number[] | null;
	/** Quota remaining for free/limited users. Null for non-free users. */
	limited_user_quotas?: { chat: number; completions: number } | null;
	/** Unix timestamp when quotas reset for free/limited users. Null for non-free users. */
	limited_user_reset_date?: number | null;
	/** Organization tracking IDs if user has org access. */
	organization_list?: string[];
	/** Notification to show in editor on successful token retrieval. */
	user_notification?: NotificationEnvelope;
}

/**
 * The shape of an error response (HTTP 403) from the server when token retrieval fails.
 */
export interface ErrorEnvelope {
	/** Whether user can sign up for Copilot Free. Null when not applicable. */
	can_signup_for_limited?: boolean | null;
	/** Detailed error information including notification_id. */
	error_details: NotificationEnvelope;
	/** Generic error message with TOS text. */
	message: string;
	/** Optional reason string. */
	reason?: string;
}

/**
 * The shape of a standard error response from the server. Used for generic errors like rate limiting.
 */
export interface StandardErrorEnvelope {
	message: string; // e.g., "API rate limit exceeded for user ID 12345. ..."
	documentation_url: string; // "https://developer.github.com/rest/overview/rate-limits-for-the-rest-api"
	status: string; // "403"
}

//#region Validators

const notificationEnvelopeValidator = vObj({
	message: vRequired(vString()),
	notification_id: vRequired(vString()),
	title: vRequired(vString()),
	url: vRequired(vString()),
});

const errorEnvelopeValidator = vObj({
	can_signup_for_limited: vNullable(vBoolean()),
	error_details: vRequired(notificationEnvelopeValidator),
	message: vRequired(vString()),
	reason: vString(),
});

const tokenEnvelopeValidator = vObj({
	token: vRequired(vString()),
	expires_at: vRequired(vNumber()),
	refresh_in: vRequired(vNumber()),
	sku: vString(),
	individual: vBoolean(),
	blackbird_clientside_indexing: vBoolean(),
	code_quote_enabled: vBoolean(),
	code_review_enabled: vBoolean(),
	codesearch: vBoolean(),
	copilotignore_enabled: vBoolean(),
	vsc_electron_fetcher_v2: vBoolean(),
	public_suggestions: vEnum('enabled', 'disabled', 'unconfigured'),
	telemetry: vEnum('enabled', 'disabled'),
	endpoints: vObj({
		api: vString(),
		'origin-tracker': vString(),
		proxy: vString(),
		telemetry: vString(),
	}),
	enterprise_list: vNullable(vArray(vNumber())),
	limited_user_quotas: vNullable(vObj({
		chat: vRequired(vNumber()),
		completions: vRequired(vNumber()),
	})),
	limited_user_reset_date: vNullable(vNumber()),
	organization_list: vArray(vString()),
	user_notification: notificationEnvelopeValidator,
});

const standardErrorEnvelopeValidator = vObj({
	message: vRequired(vString()),
	documentation_url: vRequired(vString()),
	status: vRequired(vString()),
});

/**
 * Fallback validator that only checks the critical fields required for token functionality.
 * Used when the strict validator fails, allowing the client to continue working even if
 * the server adds/changes non-critical fields.
 */
const tokenEnvelopeCriticalValidator = vObj({
	token: vRequired(vString()),
	expires_at: vRequired(vNumber()),
	refresh_in: vRequired(vNumber()),
});

/**
 * Result of validating a token envelope with the two-tier validation strategy.
 */
export type TokenValidationResult =
	| { valid: true; strategy: 'strict'; envelope: TokenEnvelope }
	| { valid: true; strategy: 'fallback'; strictError: string; envelope: TokenEnvelope; fallbackError?: string }
	| { valid: false; strategy: 'failed'; strictError: string; fallbackError: string };

/**
 * Validates a token envelope using a two-tier strategy:
 * 1. First tries strict validation against the full schema.
 * 2. If that fails, falls back to validating only critical fields (token, expires_at, refresh_in).
 *
 * This allows the client to continue working even if the server changes non-critical fields,
 * while providing telemetry data to track schema drift.
 */
export function validateTokenEnvelope(obj: unknown): TokenValidationResult {
	const strictResult = tokenEnvelopeValidator.validate(obj);
	if (strictResult.error === undefined) {
		return { valid: true, strategy: 'strict', envelope: strictResult.content };
	}

	const strictError = strictResult.error.message;

	const fallbackResult = tokenEnvelopeCriticalValidator.validate(obj);
	if (fallbackResult.error === undefined) {
		return {
			valid: true,
			strategy: 'fallback',
			strictError,
			// Use the full payload, not the validator result, to preserve all server fields
			envelope: obj as TokenEnvelope
		};
	}

	return {
		valid: false,
		strategy: 'failed',
		strictError,
		fallbackError: fallbackResult.error.message,
	};
}

export function isTokenEnvelope(obj: unknown): obj is TokenEnvelope {
	return validateTokenEnvelope(obj).valid;
}

export function isErrorEnvelope(obj: unknown): obj is ErrorEnvelope {
	return errorEnvelopeValidator.validate(obj).error === undefined;
}

export function isStandardErrorEnvelope(obj: unknown): obj is StandardErrorEnvelope {
	return standardErrorEnvelopeValidator.validate(obj).error === undefined;
}

//#endregion


/**
 * Combined response type from the /copilot_internal/v2/token endpoint.
 * Can be either a success (TokenEnvelope) or error (ErrorEnvelope) response.
 */
export type CopilotTokenResponse = TokenEnvelope | ErrorEnvelope | StandardErrorEnvelope;

/**
 * A server response containing the user info for the copilot user from the /copilot_internal/user endpoint
 */
export interface CopilotUserInfo extends CopilotUserQuotaInfo {
	access_type_sku: string;
	analytics_tracking_id: string;
	assigned_date: string;
	can_signup_for_limited: boolean;
	copilot_plan: string;
	organization_login_list: string[];
	organization_list: Array<{
		login: string;
		name: string | null;
	}>;
	codex_agent_enabled?: boolean;
}

/**
 * The token envelope extended with additional metadata that is helpful to have.
 * This includes information from both the token endpoint and the user info endpoint.
 */
export type ExtendedTokenInfo = TokenEnvelope & {
	// Extended fields added by client
	username: string;
	isVscodeTeamMember: boolean;
} & Pick<CopilotUserInfo, 'copilot_plan' | 'quota_snapshots' | 'quota_reset_date' | 'codex_agent_enabled' | 'organization_login_list'>;

/**
 * Creates a minimal ExtendedTokenInfo for testing purposes.
 * All required TokenEnvelope fields are populated with sensible defaults.
 */
export function createTestExtendedTokenInfo(overrides?: Partial<ExtendedTokenInfo>): ExtendedTokenInfo {
	return {
		// Required token envelope fields
		token: 'test-token',
		expires_at: 0,
		refresh_in: 0,
		sku: 'free_limited_copilot',
		individual: true,
		// Feature flags
		blackbird_clientside_indexing: false,
		code_quote_enabled: false,
		code_review_enabled: false,
		codesearch: false,
		copilotignore_enabled: false,
		vsc_electron_fetcher_v2: false,
		// Consent settings
		public_suggestions: 'enabled',
		telemetry: 'enabled',
		// Extended fields
		username: 'testuser',
		isVscodeTeamMember: false,
		copilot_plan: 'free',
		organization_login_list: [],
		// Apply overrides
		...overrides,
	};
}

/**
 * Reasons for token retrieval failures.
 */
export type TokenErrorReason =
	/** User doesn't have Copilot access or authorization failed. Includes detailed error_details from server with notification_id specifying the specific authorization issue. */
	'NotAuthorized' |
	/** Network request failed - no response received from the server (connection failed, endpoint unreachable, etc.). */
	'RequestFailed' |
	/** Server response could not be parsed as JSON (malformed or unexpected response format). */
	'ParseFailed' |
	/** User not authenticated with GitHub through VS Code. Only returned from VS Code integration layer, not from platform token minting. */
	'GitHubLoginFailed' |
	/** Server returned 401 Unauthorized HTTP status. */
	'HTTP401' |
	/** GitHub API rate limit exceeded (403 status with rate limit message). */
	'RateLimited';

export const enum TokenErrorNotificationId {
	NoCopilotAccess = 'no_copilot_access',
	NotSignedUp = 'not_signed_up',
	SubscriptionEnded = 'subscription_ended',
	EnterPriseManagedUserAccount = 'enterprise_managed_user_account',
	FeatureFlagBlocked = 'feature_flag_blocked',
	SpammyUser = 'spammy_user',
	BillingLocked = 'billing_locked',
	TradeRestricted = 'trade_restricted',
	TradeRestrictedCountry = 'trade_restricted_country',
	CodespacesDemoInactive = 'codespaces_demo_inactive',
	SnippyNotConfigured = 'snippy_not_configured',
	ExpiredCoupon = 'expired_coupon',
	RevokedCoupon = 'revoked_coupon',
	GoHttpClient = 'go_http_client',
	ProgrammaticTokenGeneration = 'programmatic_token_generation',
	AccessRevoked = 'access_revoked',
	ServerError = 'server_error'
}

/**
 * Notification IDs that appear in user_notification on success responses.
 */
export type SuccessNotificationId =
	| 'subscription_trial_ending'
	| 'subscription_trial_ended'
	| 'subscription_ending'
	| 'free_over_limits'
	| 'codespaces_demo_welcome'
	| `copilot_seat_added_${number}`;

export type TokenError = {
	reason: TokenErrorReason;
	notification_id?: TokenErrorNotificationId | string;
	message?: string;
	/** URL for action button to help user resolve the error. */
	url?: string;
	/** Title for the action button. */
	title?: string;
};

export type TokenInfoOrError = ({ kind: 'success' } & ExtendedTokenInfo) | ({ kind: 'failure' } & TokenError);
