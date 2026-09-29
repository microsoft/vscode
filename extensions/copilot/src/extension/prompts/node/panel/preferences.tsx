/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptReference, PromptSizing } from '@vscode/prompt-tsx';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { URI } from '../../../../util/vs/base/common/uri';
import { Tag } from '../base/tag';

export interface UserPreferencesProps extends BasePromptElementProps { }

export class UserPreferences extends PromptElement<UserPreferencesProps> {
	constructor(
		props: UserPreferencesProps,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext
	) {
		super(props);
	}
	override async render(state: void, sizing: PromptSizing) {
		if (!this.configurationService.getConfig(ConfigKey.Advanced.EnableUserPreferences)) {
			return undefined;
		}

		try {
			const uri = URI.joinPath(this.extensionContext.globalStorageUri, 'copilotUserPreferences.md');
			const fileContents = await this.fileSystemService.readFile(uri);
			return (<>
				<Tag name='instructions'>
					<references value={[new PromptReference(uri)]} />
					{new TextDecoder().decode(fileContents)}
				</Tag>

			</>);
		} catch (ex) {
			return undefined;
		}

	}
}
