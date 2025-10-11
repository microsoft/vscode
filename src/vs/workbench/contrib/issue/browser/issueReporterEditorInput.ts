/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IssueReporterData } from '../common/issue.js';

const issueReporterEditorIcon = registerIcon('issue-reporter-editor-label-icon', Codicon.bug, localize('issueReporterEditorLabelIcon', 'Icon of the issue reporter editor label.'));

export class IssueReporterEditorInput extends EditorInput {

	static readonly ID = 'workbench.editor.issueReporter';

	static readonly RESOURCE = URI.from({
		scheme: 'issue-reporter',
		path: 'default'
	});

	private static _instance: IssueReporterEditorInput;
	static get instance() {
		console.log('IssueReporterEditorInput.instance accessed', { hasInstance: !!IssueReporterEditorInput._instance, isDisposed: IssueReporterEditorInput._instance?.isDisposed() });
		if (!IssueReporterEditorInput._instance || IssueReporterEditorInput._instance.isDisposed()) {
			console.log('IssueReporterEditorInput.instance creating new instance');
			IssueReporterEditorInput._instance = new IssueReporterEditorInput();
		}

		return IssueReporterEditorInput._instance;
	}

	public issueReporterData: IssueReporterData | undefined;

	override get typeId(): string { return IssueReporterEditorInput.ID; }

	override get editorId(): string | undefined { return IssueReporterEditorInput.ID; }

	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton; }

	readonly resource = IssueReporterEditorInput.RESOURCE;

	override getName(): string {
		return localize('issueReporterInputName', "Issue Reporter");
	}

	override getIcon(): ThemeIcon {
		return issueReporterEditorIcon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		return other instanceof IssueReporterEditorInput;
	}

	setIssueReporterData(data: IssueReporterData): void {
		console.log('IssueReporterEditorInput.setIssueReporterData called', { data, hasData: !!data });
		this.issueReporterData = data;
		console.log('IssueReporterEditorInput.setIssueReporterData set', { issueReporterData: this.issueReporterData });
	}
}
