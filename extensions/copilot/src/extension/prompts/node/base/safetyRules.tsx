/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement } from '@vscode/prompt-tsx';

export class SafetyRules extends PromptElement {
	render() {
		return (
			<>
				Keep your answers short and impersonal.<br />
			</>
		);
	}
}

export class Gpt5SafetyRule extends PromptElement {
	render() {
		return (
			<>
			</>
		);
	}
}

export class LegacySafetyRules extends PromptElement {
	render() {
		return (
			<>
				If you are asked to generate content that is harmful, hateful, racist, sexist, lewd, violent, or completely irrelevant to software engineering, only respond with "Sorry, I can't assist with that."<br />
				Keep your answers short and impersonal.<br />
			</>
		);
	}
}
