/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { IEventService } from 'vs/platform/event/common/event';
import { Match, FileMatch } from 'vs/workbench/parts/search/common/searchModel';
import { BulkEdit, IResourceEdit, createBulkEdit } from 'vs/editor/common/services/bulkEdit';
import { IProgressRunner } from 'vs/platform/progress/common/progress';

export class ReplaceService implements IReplaceService {

	public serviceId= IReplaceService;

	constructor(@IEventService private eventService: IEventService, @IEditorService private editorService) {
	}

	public replace(match: Match, text: string): TPromise<any>
	public replace(files: FileMatch[], text: string, progress?: IProgressRunner): TPromise<any>
	public replace(arg: any, text: string, progress: IProgressRunner= null): TPromise<any> {

		let bulkEdit: BulkEdit = createBulkEdit(this.eventService, this.editorService, null);
		bulkEdit.progress(progress);

		if (arg instanceof Match) {
			bulkEdit.add([this.createEdit(arg, text)]);
		}

		if (arg instanceof Array) {
			arg.forEach(element => {
				let fileMatch = <FileMatch>element;
				fileMatch.matches().forEach(match => {
					bulkEdit.add([this.createEdit(match, text)]);
				});
			});
		}

		return bulkEdit.finish();
	}

	private createEdit(match: Match, text: string): IResourceEdit {
		let fileMatch: FileMatch= match.parent();
		let resourceEdit: IResourceEdit= {
			resource: fileMatch.resource(),
			range: match.range(),
			newText: text
		};
		return resourceEdit;
	}
}