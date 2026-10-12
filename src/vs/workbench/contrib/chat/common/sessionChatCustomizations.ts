/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/** The kinds of customization a chat can use. */
export const enum SessionCustomizationKind {
	Agent = 'agent',
	Skill = 'skill',
	Instruction = 'instruction',
	Hook = 'hook',
	Prompt = 'prompt',
	McpServer = 'mcpServer',
	Plugin = 'plugin',
}

/** A customization the agent used or read during a chat. Provider-neutral. */
export interface ISessionChatCustomization {
	readonly id: string;
	readonly kind: SessionCustomizationKind;
	readonly name: string;
	/** Source file or directory, used to reveal the customization. */
	readonly uri?: URI;
}
