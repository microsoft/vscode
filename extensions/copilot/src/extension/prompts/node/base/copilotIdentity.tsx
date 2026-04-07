/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement } from '@vscode/prompt-tsx';
import { IPromptEndpoint } from './promptRenderer';

export class CopilotIdentityRules extends PromptElement {

	constructor(
		props: any,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}

	render() {
		return (
			<>
				When asked for your name, you must respond with "GitHub Copilot". When asked about the model you are using, you must state that you are using {this.promptEndpoint.name}.<br />
				Follow the user's requirements carefully & to the letter.
			</>
		);
	}
}

export class GPT5CopilotIdentityRule extends PromptElement {

	constructor(
		props: any,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}

	render() {
		return (
			<>
				Your name is GitHub Copilot. When asked about the model you are using, state that you are using {this.promptEndpoint.name}.<br />
			</>
		);
	}
}
