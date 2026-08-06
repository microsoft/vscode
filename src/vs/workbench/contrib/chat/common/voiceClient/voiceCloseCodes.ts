/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * WebSocket close codes the voice backend uses to explain a refusal or a
 * termination. Mirrors `voice_code/core/close_codes.py`; the two lists must
 * stay in step.
 *
 * `kind` drives both retry policy and presentation:
 * - `fatal`     — will not succeed on retry; show an error plus an action.
 * - `expected`  — a normal end of session; show a neutral prompt to restart.
 * - `transient` — may succeed on retry; keep the reconnect loop running.
 *
 * Note 4000 is reserved: the client itself closes with it on pong timeout.
 */
export const enum VoiceCloseCode {
	Unauthenticated = 4001,
	Forbidden = 4003,
	SessionReplaced = 4008,
	ServerBusy = 4029,
	InternalError = 4500,
	AuthUnavailable = 4503,
}

export type VoiceCloseKind = 'fatal' | 'expected' | 'transient';

export type VoiceCloseAction = 'signIn' | 'retry' | 'openSettings' | 'requestAccess';

export interface IVoiceCloseCodeInfo {
	readonly kind: VoiceCloseKind;
	readonly action?: VoiceCloseAction;
}

const INFO = new Map<number, IVoiceCloseCodeInfo>([
	[VoiceCloseCode.Unauthenticated, { kind: 'fatal', action: 'signIn' }],
	[VoiceCloseCode.Forbidden, { kind: 'fatal', action: 'requestAccess' }],
	[VoiceCloseCode.SessionReplaced, { kind: 'expected' }],
	[VoiceCloseCode.ServerBusy, { kind: 'fatal', action: 'retry' }],
	[VoiceCloseCode.InternalError, { kind: 'transient' }],
	[VoiceCloseCode.AuthUnavailable, { kind: 'transient' }],

	// Plain RFC codes. 1001 is the backend's idle timeout, which deliberately
	// keeps that code: renumbering it into the 4xxx range would make clients
	// predating this registry treat it as transient and reconnect forever.
	[1000, { kind: 'expected' }],
	[1001, { kind: 'expected' }],
	// Legacy equivalents from a backend that predates the registry, so a new
	// client still explains itself when the two repos are out of step.
	[1011, { kind: 'transient' }],
	[1013, { kind: 'fatal', action: 'retry' }],
]);

/** Return the registry entry for `code`, or `undefined` if it is unknown. */
export function voiceCloseCodeInfo(code: number): IVoiceCloseCodeInfo | undefined {
	return INFO.get(code);
}

/**
 * Whether `code` ends the session for good. Unknown codes — notably the bare
 * 1006 a browser reports for any failure it cannot inspect — are NOT terminal,
 * so they keep the existing reconnect behaviour.
 */
export function isTerminalCloseCode(code: number): boolean {
	const info = INFO.get(code);
	return info !== undefined && info.kind !== 'transient';
}
