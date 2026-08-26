/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The wire shapes live-compat scenarios read off AHP.
 *
 * These are deliberately **not** imports of the working tree's protocol types.
 * A scenario here drives four builds at once, and the working tree's types
 * describe only the newest of them: typing an older build's payload with them
 * would quietly promise fields that build never sends. Worse, the protocol
 * types are part of the code under test, so a compatibility suite that
 * borrowed them could not detect a breaking change to them.
 *
 * So each interface below is a hand-written, *narrow* description of exactly
 * the fields the suite asserts on, with everything optional that any build in
 * the matrix may omit. Widening one is a deliberate act that says "the suite
 * now depends on this field being present on every supported build".
 */

/** `initialize` result, narrowed to the fields the suite reads. */
export interface ILiveCompatInitializeResult {
	readonly protocolVersion: string;
}

/** One entry of `listSessions`, narrowed to durable identity and metadata. */
export interface ILiveCompatSessionListItem {
	readonly resource: string;
	readonly provider?: string;
	readonly title?: string;
}

/** `listSessions` result. */
export interface ILiveCompatSessionList {
	readonly items?: readonly ILiveCompatSessionListItem[];
}

/** `subscribe` result carrying a channel snapshot. */
export interface ILiveCompatSubscribeResult {
	readonly snapshot?: { readonly state?: ILiveCompatChannelState };
}

/** Union of the session/root state fields the suite reads. */
export interface ILiveCompatChannelState {
	readonly title?: string;
	readonly chats?: readonly { readonly resource: string }[];
	readonly agents?: readonly ILiveCompatAgentDescriptor[];
}

/** A provider as advertised on the root channel. */
export interface ILiveCompatAgentDescriptor {
	readonly provider: string;
	readonly capabilities?: AgentProviderCapabilities;
}

/**
 * Provider capabilities the adapter interprets. Presence is the signal; the
 * inner shape is irrelevant to every question the suite asks, so it is left
 * unmodelled rather than mirrored inaccurately across four builds.
 */
export interface AgentProviderCapabilities {
	readonly multipleChats?: object;
}
