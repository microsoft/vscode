/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IWorkspaceTrustService } from 'vs/platform/workspace/common/workspaceTrust';
import { EditorInput } from 'vs/workbench/common/editor';
import { WorkspaceTrustEditorModel, WorkspaceTrustService } from 'vs/workbench/services/workspaces/common/workspaceTrust';

export class WorkspaceTrustEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.workspaceTrust';

	readonly resource: URI = URI.from({
		scheme: Schemas.vscodeWorkspaceTrust,
		path: `workspaceTrustEditor`
	});

	constructor(
		@IWorkspaceTrustService private readonly workspaceTrustService: WorkspaceTrustService
	) {
		super();
	}

	getTypeId(): string {
		return WorkspaceTrustEditorInput.ID;
	}

	matches(otherInput: unknown): boolean {
		return otherInput instanceof WorkspaceTrustEditorInput;
	}

	getName(): string {
		return localize('workspaceTrustEditorInputName', "Workspace Trust");
	}

	async resolve(): Promise<WorkspaceTrustEditorModel> {
		return this.workspaceTrustService.workspaceTrustEditorModel;
	}
}
