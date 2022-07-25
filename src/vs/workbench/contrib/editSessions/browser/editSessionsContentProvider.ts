/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { EDIT_SESSIONS_SCHEME, IEditSessionsWorkbenchService } from 'vs/workbench/contrib/editSessions/common/editSessions';

export class EditSessionsContentProvider implements ITextModelContentProvider {

	constructor(
		@IEditSessionsWorkbenchService private editSessionsWorkbenchService: IEditSessionsWorkbenchService,
		@IModelService private readonly modelService: IModelService,
	) { }

	async provideTextContent(uri: URI): Promise<ITextModel | null> {
		let model: ITextModel | null = null;
		if (uri.scheme === EDIT_SESSIONS_SCHEME) {
			const match = /(?<ref>[^/]+)\/(?<folderName>[^/]+)\/(?<filePath>.*)/.exec(uri.path.substring(1));
			if (match?.groups) {
				const { ref, folderName, filePath } = match.groups;
				const data = await this.editSessionsWorkbenchService.read(ref);
				const content = data?.editSession.folders.find((f) => f.name === folderName)?.workingChanges.find((change) => change.relativeFilePath === filePath)?.contents;
				if (content) {
					model = this.modelService.createModel(content, null, uri);
				}
			}
		}
		return model;
	}
}
