/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { localize } from '../../../../../../nls.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import {
	CountTokensCallback,
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolResult,
	ToolDataSource,
	ToolProgress,
} from '../languageModelToolsService.js';

export class GetUserDataHomeTool implements IToolImpl {

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
	) { }

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const location = this.userDataProfileService.currentProfile.location;
		return {
			content: [{ kind: 'text', value: location.fsPath }],
		};
	}
}

export const GetUserDataHomeToolData: IToolData = {
	id: 'vscode_getUserDataHome',
	source: ToolDataSource.Internal,
	toolReferenceName: 'getUserDataHome',
	displayName: localize('getUserDataHomeTool.displayName', 'Get User Data Home'),
	modelDescription: 'Returns the file system path to the VS Code user settings home folder.',
	canBeReferencedInPrompt: false,
};
