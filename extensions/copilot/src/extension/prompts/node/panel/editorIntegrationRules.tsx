/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement } from '@vscode/prompt-tsx';
import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IExtensionsService } from '../../../../platform/extensions/common/extensionsService';

export const MERMAID_MARKDOWN_EXTENSION_ID = 'vscode.mermaid-markdown-features';

export class EditorIntegrationRules extends PromptElement {
	render() {
		return (
			<>
				Use Markdown formatting in your answers.<br />
				Make sure to include the programming language name at the start of the Markdown code blocks.<br />
				Avoid wrapping the whole response in triple backticks.<br />
				<ResponseRenderingRules />
				The user works in an IDE called Visual Studio Code which has a concept for editors with open files, integrated unit test support, an output pane that shows the output of running the code as well as an integrated terminal.<br />
				The active document is the source code the user is looking at right now.<br />
				You can only give one reply for each conversation turn.<br />
			</>
		);
	}
}

export class ResponseRenderingRules extends PromptElement {
	render() {
		return (
			<>
				<MathIntegrationRules />
				<MermaidIntegrationRules />
			</>
		);
	}
}

export class MathIntegrationRules extends PromptElement {

	constructor(
		props: BasePromptElementProps,
		@IConfigurationService private readonly configService: IConfigurationService
	) {
		super(props);
	}

	render() {
		const mathEnabled = this.configService.getNonExtensionConfig<boolean>('chat.math.enabled');
		if (mathEnabled) {
			return (
				<>
					Use KaTeX for math equations in your answers.<br />
					Wrap inline math equations in $.<br />
					Wrap more complex blocks of math equations in $$.<br />
				</>
			);
		}
	}
}

export class MermaidIntegrationRules extends PromptElement {

	constructor(
		props: BasePromptElementProps,
		@IExtensionsService private readonly extensionsService: IExtensionsService
	) {
		super(props);
	}

	render() {
		if (this.extensionsService.getExtension(MERMAID_MARKDOWN_EXTENSION_ID, true)) {
			return (
				<>
					Use ```mermaid fenced code blocks to render Mermaid diagrams in your answers.<br />
				</>
			);
		}
	}
}
