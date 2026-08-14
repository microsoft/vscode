/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum AgentMarkdownOrigin {
	/** The user steered mid-turn and the message was folded into that turn. */
	UserSteering = 'userSteering',
}

interface IHasMarkdownOriginMeta {
	readonly _meta?: Record<string, unknown>;
}

/** Reads the authoring origin of a markdown response part, if the host declared one. */
export function readAgentMarkdownOrigin(source: IHasMarkdownOriginMeta): AgentMarkdownOrigin | undefined {
	return source._meta?.['origin'] === AgentMarkdownOrigin.UserSteering ? AgentMarkdownOrigin.UserSteering : undefined;
}

/** Serializes a markdown authoring origin for the open protocol bag. */
export function toAgentMarkdownOriginMeta(origin: AgentMarkdownOrigin): Record<string, unknown> {
	return { origin };
}
