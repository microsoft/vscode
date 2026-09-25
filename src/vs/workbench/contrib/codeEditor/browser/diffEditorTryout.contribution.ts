/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { registerOnboardingTryout } from '../../onboarding/common/onboardingTryout.js';
import { EditorSampleTryoutPayload } from '../../onboarding/common/onboardingTryoutActions.js';

class DiffEditorTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.diffEditorTryout';

	constructor() {
		super();
		this._register(registerOnboardingTryout<EditorSampleTryoutPayload>({
			id: 'editor.smart-diff',
			title: localize('diffEditor.tryout.title', "Try Smart Diff Layout"),
			description: localize('diffEditor.tryout.description', "Open a read-only sample comparison. Use Diff View to choose Inline, Side by Side, or Automatic, then resize the editor."),
			presentation: {
				kind: 'editorSample',
				payload: {
					type: 'diff',
					title: localize('diffEditor.tryout.editorTitle', "Smart Diff Layout Example"),
					languageId: 'typescript',
					original: [
						'interface Project {',
						'\tname: string;',
						'\tarchived: boolean;',
						'}',
						'',
						'export function findProject(projects: Project[], name: string): Project | undefined {',
						'\treturn projects.find(project => project.name === name);',
						'}',
						'',
						'export function listProjects(projects: Project[]): string[] {',
						'\treturn projects.map(project => project.name);',
						'}',
					].join('\n'),
					modified: [
						'interface Project {',
						'\tname: string;',
						'\tarchived: boolean;',
						'}',
						'',
						'export function findProject(projects: Project[], name: string): Project | undefined {',
						'\tconst normalizedName = name.trim().toLowerCase();',
						'\treturn projects.find(project => project.name.toLowerCase() === normalizedName);',
						'}',
						'',
						'export function listProjects(projects: Project[]): string[] {',
						'\treturn projects',
						'\t\t.filter(project => !project.archived)',
						'\t\t.map(project => project.name)',
						'\t\t.sort();',
						'}',
					].join('\n'),
				},
			},
		}));
	}
}

registerWorkbenchContribution2(DiffEditorTryoutContribution.ID, DiffEditorTryoutContribution, WorkbenchPhase.BlockRestore);
