/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptPiece, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { IPromptEndpoint } from './promptRenderer';
import { modelPrefersInstructionsInUserMessage } from '../../../../platform/endpoint/common/chatModelCapabilities';

export class InstructionMessage extends PromptElement {
	constructor(props: any, @IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint) {
		super(props);
	}
	override render(_state: void, sizing: PromptSizing): PromptPiece {
		return modelPrefersInstructionsInUserMessage(this.promptEndpoint.family)
			? <UserMessage>{this.props.children}</UserMessage>
			: <SystemMessage>{this.props.children}</SystemMessage>;
	}
}
