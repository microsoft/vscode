/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Close codes mirrored from `voice_code/core/close_codes.py`.
 *
 * `kind` drives retry policy and presentation: `fatal` will not succeed on
 * retry, `expected` is a normal end of session, `transient` keeps reconnecting.
 * Code 4000 is reserved for the client's own pong-timeout close.
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

export type VoiceCloseAction = 'signIn' | 'openSettings';

export interface IVoiceCloseCodeInfo {
	readonly kind: VoiceCloseKind;
	readonly action?: VoiceCloseAction;
}

const INFO = new Map<number, IVoiceCloseCodeInfo>([
	[VoiceCloseCode.Unauthenticated, { kind: 'fatal', action: 'signIn' }],
	// No action: there is nothing the user can do in-product about this one.
	[VoiceCloseCode.Forbidden, { kind: 'fatal' }],
	[VoiceCloseCode.SessionReplaced, { kind: 'expected' }],
	// Capacity clears on its own, so keep reconnecting and explain meanwhile.
	[VoiceCloseCode.ServerBusy, { kind: 'transient' }],
	[VoiceCloseCode.InternalError, { kind: 'transient' }],
	[VoiceCloseCode.AuthUnavailable, { kind: 'transient' }],

	// 1001 is the backend's idle timeout, which keeps that code on purpose.
	[1000, { kind: 'expected' }],
	[1001, { kind: 'expected' }],
	// Emitted by backends that predate this registry.
	[1011, { kind: 'transient' }],
	[1013, { kind: 'transient' }],
]);

/** Return the registry entry for `code`, or `undefined` if it is unknown. */
export function voiceCloseCodeInfo(code: number): IVoiceCloseCodeInfo | undefined {
	return INFO.get(code);
}

/** Whether `code` ends the session. Unknown codes, including 1006, stay retryable. */
export function isTerminalCloseCode(code: number): boolean {
	const info = INFO.get(code);
	return info !== undefined && info.kind !== 'transient';
}
