/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ISurveyDefinition } from './surveyQuestions.js';

const surveyIcon = registerIcon('survey', Codicon.feedback, localize('surveyIcon', "Icon for the survey editor."));

export class SurveyEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.survey';

	private _source: string | undefined;

	constructor(
		readonly survey: ISurveyDefinition,
		/** The Copilot feature source that triggered this survey (e.g. 'completions', 'panel.agent', 'agent.codeEdit'). */
		source?: string,
	) {
		super();
		this._source = source;
	}

	get source(): string | undefined {
		return this._source;
	}

	/** Update the source when re-triggered while already open. */
	updateSource(source: string | undefined): void {
		this._source = source;
	}

	override get typeId(): string {
		return SurveyEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override get resource(): URI | undefined {
		return URI.from({ scheme: 'vscode-survey', path: `/${this.survey.id}` });
	}

	override getName(): string {
		return this.survey.title;
	}

	override getIcon(): ThemeIcon | undefined {
		return surveyIcon;
	}

	override matches(other: EditorInput | unknown): boolean {
		return other instanceof SurveyEditorInput && other.survey.id === this.survey.id;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton | EditorInputCapabilities.Readonly;
	}
}
