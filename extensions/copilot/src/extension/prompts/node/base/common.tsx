/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement } from '@vscode/prompt-tsx';

/**
 * @deprecated Workaround for a prompt-tsx issue which has since been fixed
 * See https://github.com/microsoft/vscode-prompt-tsx/issues/90 and https://github.com/microsoft/vscode-prompt-tsx/pull/94
 */
export class CompositeElement extends PromptElement {
	render() {
		return <>{this.props.children}</>;
	}
}
