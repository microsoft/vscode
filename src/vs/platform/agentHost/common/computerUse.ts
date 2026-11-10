/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VS Code extension contract for GitHub's Computer Use plugin. The local macOS Agent Host publishes
 * {@link IComputerUseStatusV1} as the root transient value {@link COMPUTER_USE_STATUS_KEY} to set up the plugin's
 * macOS permissions; clients send {@link IComputerUseRequest}s through {@link COMPUTER_USE_REQUEST_KEY}. Both ride
 * namespaced root config values, not AHP proper, so hosts without the feature publish nothing and clients keep the
 * ordinary elicitation UI. A host that offers the agent a way to turn Computer Use on asks through a chat input request
 * marked with {@link COMPUTER_USE_ACTIVATION_META_KEY}.
 *
 * The host stays authoritative: a permission is `granted` only after Copilot Computer Use's helper verified it, and
 * every operation runs through the plugin's own MCP connection, which the Copilot runtime owns. Values read off the
 * wire go through the validating readers in `common/meta/computerUse.ts`; never cast them.
 */

// #region Keys

/** Root transient value carrying the host's {@link IComputerUseStatusV1}. Absent when the host cannot set up Computer Use. */
export const COMPUTER_USE_STATUS_KEY = 'vscode.computerUse.status';

/**
 * Root config key a client writes an {@link IComputerUseRequest} to. The host claims the request's nonce and clears the
 * key before acting, so a repeated identical gesture still lands.
 */
export const COMPUTER_USE_REQUEST_KEY = 'vscode.computerUse.request';

/**
 * Namespaced `_meta` key on the chat input request that stands for a setup in the chat. Clients that understand it
 * show a setup entry point; others render the request's ordinary questions, which remain answerable.
 */
export const COMPUTER_USE_SETUP_META_KEY = 'vscode.computerUse.setup';

/**
 * Namespaced `_meta` key on the chat input request that asks the user to turn on Computer Use, carrying
 * {@link IComputerUseActivationCard}. Clients that understand it show a compact card; others render the request's
 * ordinary question, which remains answerable.
 */
export const COMPUTER_USE_ACTIVATION_META_KEY = 'vscode.computerUse.activation';

/** The single-select question of a request to turn on Computer Use. */
export const COMPUTER_USE_ACTIVATION_QUESTION_ID = 'computerUse';

/** The choices of {@link COMPUTER_USE_ACTIVATION_QUESTION_ID}; only `turnOn`, submitted with an accepted request, turns it on. */
export const computerUseActivationChoices = ['turnOn', 'notNow'] as const;
export type ComputerUseActivationChoice = typeof computerUseActivationChoices[number];

/** What a request to turn on Computer Use shows besides its fixed text. */
export interface IComputerUseActivationCard {
	/** Why the agent asks, in the agent's own words, at most {@link COMPUTER_USE_ACTIVATION_REASON_MAX_LENGTH} characters. Untrusted: render it as plain text. */
	readonly reason?: string;
}

/** The longest {@link IComputerUseActivationCard.reason}. Hosts trim the agent's reason to it; readers drop longer ones. */
export const COMPUTER_USE_ACTIVATION_REASON_MAX_LENGTH = 300;

// #endregion

// #region Status

/** The macOS permissions Copilot Computer Use requires before any of its tools run. */
export const computerUsePermissions = ['accessibility', 'screenRecording'] as const;
export type ComputerUsePermission = typeof computerUsePermissions[number];

/** `unknown` until the helper reported the permission in this Agent Host process. */
export const computerUsePermissionStates = ['granted', 'notGranted', 'unknown'] as const;
export type ComputerUsePermissionState = typeof computerUsePermissionStates[number];

/**
 * - `needsPermissions`: the plugin waits for the user to choose an action.
 * - `working`: an action was sent and the plugin has not reported its outcome yet.
 * - `ready`: the plugin verified both permissions and resumed the operation that was waiting.
 * - `ended`: the setup closed without readiness, e.g. because the user declined or the waiting tool call or turn stopped.
 */
export const computerUseSetupStates = ['needsPermissions', 'working', 'ready', 'ended'] as const;
export type ComputerUseSetupState = typeof computerUseSetupStates[number];

/**
 * - `allow`: get a permission turned on. The first time the host asks for the permission in this Agent Host process, it
 *   shows the native macOS prompt, which macOS shows only once per app. After that it opens the permission's pane in
 *   System Settings. The plugin offers the pane only after a native request in its current loop, so in a new loop the
 *   host first sends a native request that macOS keeps silent, and opens the pane on the plugin's next prompt.
 * - `recheck`: restart Copilot Computer Use's helper, which some grants need to take effect, and verify again.
 */
export const computerUseActions = ['allow', 'recheck'] as const;
export type ComputerUseAction = typeof computerUseActions[number];

/** Actions that must carry {@link IComputerUseRequest.permission}. */
export const computerUsePermissionActions: readonly ComputerUseAction[] = ['allow'];

export interface IComputerUsePermissionStatusV1 {
	readonly permission: ComputerUsePermission;
	readonly state: ComputerUsePermissionState;
}

/** An action a setup accepts now. */
export interface IComputerUseSetupActionV1 {
	readonly action: ComputerUseAction;
	/** Present exactly for {@link computerUsePermissionActions}. */
	readonly permission?: ComputerUsePermission;
}

/** A user-facing failure; `message` is localized by the host. `code` stays an open string so newer codes reach older clients, which show `message`. */
export interface IComputerUseErrorV1 {
	readonly code: string;
	readonly message: string;
}

/** One chat turn waiting for Computer Use permissions. */
export interface IComputerUseSetupV1 {
	readonly id: string;
	/** Chat channel URI of the turn that waits. */
	readonly chat: string;
	readonly state: ComputerUseSetupState;
	/** Increments every time the plugin reports the permissions again; requests must name the current round. */
	readonly round: number;
	/** `allow` for each permission the plugin found missing, and `recheck`. Empty unless {@link state} is `needsPermissions`. */
	readonly actions: readonly IComputerUseSetupActionV1[];
	/**
	 * Only `stillNotGranted`: a check the user asked for changed nothing. Clients announce it to screen readers. Ended
	 * setups carry none.
	 */
	readonly error?: IComputerUseErrorV1;
}

/**
 * The action in flight: `allow` with its permission while the host has macOS ask for it or opens its System Settings
 * pane, `recheck` while the helper verifies again. At most one runs at a time across all setups, because they share one
 * helper and one set of native prompts.
 */
export interface IComputerUseOperationV1 {
	readonly setupId: string;
	readonly action: ComputerUseAction;
	readonly permission?: ComputerUsePermission;
}

export interface IComputerUseStatusV1 {
	readonly schemaVersion: 1;
	/** Every required permission, in {@link computerUsePermissions} order, with its last verified state. These are machine-wide: all setups share them. */
	readonly permissions: readonly IComputerUsePermissionStatusV1[];
	/** Epoch ms of the last verification; absent while every permission is `unknown`. */
	readonly verifiedAt?: number;
	readonly operation?: IComputerUseOperationV1;
	/** Setups that wait for the user, run an action, or finished recently; oldest first. */
	readonly setups: readonly IComputerUseSetupV1[];
	/** The app that macOS grants the permissions to. */
	readonly helperApp?: IComputerUseHelperAppV1;
}

/** Copilot Computer Use, the app macOS lists under each permission in System Settings. */
export interface IComputerUseHelperAppV1 {
	/** Absolute path of the app bundle. Clients that can drag files offer it for dragging into a System Settings list that doesn't show it. */
	readonly path: string;
	/** The app's icon as a PNG data URL, once the host read it. */
	readonly icon?: string;
}

// #endregion

// #region Requests

/** The value a client writes to {@link COMPUTER_USE_REQUEST_KEY}. */
export interface IComputerUseRequest {
	/** Fresh per gesture; the host ignores nonces it has already seen. */
	readonly nonce: string;
	readonly setupId: string;
	/** The {@link IComputerUseSetupV1.round} the user acted on; the host drops requests for an older round. */
	readonly round: number;
	readonly action: ComputerUseAction;
	readonly permission?: ComputerUsePermission;
}

const MAX_ID_LENGTH = 256;

function isBoundedId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/** Whether `value` is a well-formed {@link IComputerUseRequest}, including the permission each action requires. */
export function isComputerUseRequest(value: unknown): value is IComputerUseRequest {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const request: Partial<Record<keyof IComputerUseRequest, unknown>> = value;
	const action = computerUseActions.find(candidate => candidate === request.action);
	if (!isBoundedId(request.nonce) || !isBoundedId(request.setupId) || !action) {
		return false;
	}
	if (typeof request.round !== 'number' || !Number.isSafeInteger(request.round) || request.round < 0) {
		return false;
	}
	if (request.permission !== undefined && !computerUsePermissions.some(permission => permission === request.permission)) {
		return false;
	}
	return computerUsePermissionActions.includes(action) === (request.permission !== undefined);
}

// #endregion
