/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { TextEdit, WorkspaceEdit, WorkspaceEditMetadata, IWorkspaceFileEdit, WorkspaceFileEditOptions, IWorkspaceTextEdit } from 'vs/editor/common/languages';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { isObject } from 'vs/base/common/types';
import { UndoRedoSource } from 'vs/platform/undoRedo/common/undoRedo';
import { CancellationToken } from 'vs/base/common/cancellation';

export const IBulkEditService = createDecorator<IBulkEditService>('IWorkspaceEditService');

export class ResourceEdit {

	protected constructor(readonly metadata?: WorkspaceEditMetadata) { }

	static convert(edit: WorkspaceEdit): ResourceEdit[] {

		return edit.edits.map(edit => {
			if (ResourceTextEdit.is(edit)) {
				return ResourceTextEdit.lift(edit);
			}

			if (ResourceFileEdit.is(edit)) {
				return ResourceFileEdit.lift(edit);
			}
			throw new Error('Unsupported edit');
		});
	}
}

export class ResourceTextEdit extends ResourceEdit implements IWorkspaceTextEdit {

	static is(candidate: any): candidate is IWorkspaceTextEdit {
		if (candidate instanceof ResourceTextEdit) {
			return true;
		}
		return isObject(candidate)
			&& URI.isUri((<IWorkspaceTextEdit>candidate).resource)
			&& isObject((<IWorkspaceTextEdit>candidate).textEdit);
	}

	static lift(edit: IWorkspaceTextEdit): ResourceTextEdit {
		if (edit instanceof ResourceTextEdit) {
			return edit;
		} else {
			return new ResourceTextEdit(edit.resource, edit.textEdit, edit.versionId, edit.metadata);
		}
	}

	constructor(
		readonly resource: URI,
		readonly textEdit: TextEdit & { insertAsSnippet?: boolean },
		readonly versionId: number | undefined = undefined,
		metadata?: WorkspaceEditMetadata,
	) {
		super(metadata);
	}
}

export class ResourceFileEdit extends ResourceEdit implements IWorkspaceFileEdit {

	static is(candidate: any): candidate is IWorkspaceFileEdit {
		if (candidate instanceof ResourceFileEdit) {
			return true;
		} else {
			return isObject(candidate)
				&& (Boolean((<IWorkspaceFileEdit>candidate).newResource) || Boolean((<IWorkspaceFileEdit>candidate).oldResource));
		}
	}

	static lift(edit: IWorkspaceFileEdit): ResourceFileEdit {
		if (edit instanceof ResourceFileEdit) {
			return edit;
		} else {
			return new ResourceFileEdit(edit.oldResource, edit.newResource, edit.options, edit.metadata);
		}
	}

	constructor(
		readonly oldResource: URI | undefined,
		readonly newResource: URI | undefined,
		readonly options: WorkspaceFileEditOptions = {},
		metadata?: WorkspaceEditMetadata
	) {
		super(metadata);
	}
}

export interface IBulkEditOptions {
	editor?: ICodeEditor;
	progress?: IProgress<IProgressStep>;
	token?: CancellationToken;
	showPreview?: boolean;
	label?: string;
	code?: string;
	quotableLabel?: string;
	undoRedoSource?: UndoRedoSource;
	undoRedoGroupId?: number;
	confirmBeforeUndo?: boolean;
	respectAutoSaveConfig?: boolean;
}

export interface IBulkEditResult {
	ariaSummary: string;
	isApplied: boolean;
}

export type IBulkEditPreviewHandler = (edits: ResourceEdit[], options?: IBulkEditOptions) => Promise<ResourceEdit[]>;

export interface IBulkEditService {
	readonly _serviceBrand: undefined;

	hasPreviewHandler(): boolean;

	setPreviewHandler(handler: IBulkEditPreviewHandler): IDisposable;

	apply(edit: ResourceEdit[] | WorkspaceEdit, options?: IBulkEditOptions): Promise<IBulkEditResult>;
}
