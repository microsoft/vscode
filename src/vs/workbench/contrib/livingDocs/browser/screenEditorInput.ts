/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ScreenId } from './screenRender.js';

export const SCREEN_EDITOR_ID = 'workbench.editor.livingDocs.screen';

const TITLES: Record<ScreenId, string> = {
	home: 'Home',
	templates: 'Templates',
	knowledge: 'Knowledge',
	agents: 'Agents',
	'project-run': 'Agent Run',
	'review-project': 'Review Project',
};

// One singleton editor input per Abstract screen (Templates / Knowledge / Agents). The screen
// id is carried in a synthetic resource so the editor service treats each screen as its own editor.
export class ScreenEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.livingDocs.screen';

	private readonly _resource: URI;

	constructor(readonly screen: ScreenId) {
		super();
		this._resource = URI.from({ scheme: 'opportunity-os-screen', path: `/${screen}` });
	}

	override get typeId(): string { return ScreenEditorInput.ID; }
	override get editorId(): string | undefined { return SCREEN_EDITOR_ID; }
	override get resource(): URI { return this._resource; }

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton;
	}

	override getName(): string {
		return TITLES[this.screen];
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		return other instanceof ScreenEditorInput && other.screen === this.screen;
	}
}
