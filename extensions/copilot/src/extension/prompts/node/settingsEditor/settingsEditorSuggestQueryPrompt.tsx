/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, SystemMessage, TextChunk, UserMessage } from '@vscode/prompt-tsx';
import { settingItemToContext, SettingListItem } from '../../../../platform/embeddings/common/vscodeIndex';
import { InstructionMessage } from '../base/instructionMessage';
import { Tag } from '../base/tag';

export interface SettingsEditorSuggestQueryPromptProps extends BasePromptElementProps {
	readonly query: string;
	readonly settings: SettingListItem[];
}

export class SettingsEditorSuggestQueryPrompt extends PromptElement<SettingsEditorSuggestQueryPromptProps> {
	render() {
		return (
			<>
				<SystemMessage>
					You are a Visual Studio Code assistant. Your job is to assist users in using Visual Studio Code by returning settings that answer their question.<br />
					<InstructionMessage>
						Additional Rules<br />
						If a setting references another setting, you must respond with both the original and the referenced settings.<br />
						Return up to two settings from the list that the user is most likely to be looking for.<br />
						If you believe the context given to you is incorrect or not relevant you may ignore it.<br />
						List each setting on a new line.<br />
						Only list the setting names. Do not list anything else.<br />
						Do not indent the lines.<br />
					</InstructionMessage>
				</SystemMessage>
				<UserMessage>
					Below is a list of information we found which might be relevant to the question. For view related commands "Toggle" often means Show or Hide. A setting may reference another setting, that will appear as \`#setting.id#\`, you must return the referenced setting as well. You may use this context to help you formulate your response, but are not required to.<br />
					{this.props.settings.length > 0 && <><Tag name='settings'>
						Here are some possible settings:<br />
						{this.props.settings.map(c => <TextChunk>{settingItemToContext(c)}</TextChunk>)}
					</Tag>
					</>}
					What are some settings for "{this.props.query}"?
				</UserMessage>
			</>
		);
	}
}
