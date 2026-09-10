/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { DockedEditorInput } from '../../../common/dockedEditorInput.js';
import { ISessionComparisonService } from '../../../services/sessions/common/sessionComparison.js';

const SESSION_COMPARISON_SCHEME = 'sessions-comparison';

export class SessionComparisonEditorInput extends DockedEditorInput {
	static readonly ID = 'workbench.input.agentSessions.sessionComparison';
	static readonly EDITOR_ID = 'workbench.editor.agentSessions.sessionComparison';

	readonly resource: URI;

	constructor(
		readonly comparisonId: string,
		@ISessionComparisonService private readonly sessionComparisonService: ISessionComparisonService,
	) {
		super();
		this.resource = URI.from({ scheme: SESSION_COMPARISON_SCHEME, path: `/${comparisonId}` });
	}

	override get typeId(): string {
		return SessionComparisonEditorInput.ID;
	}

	override get editorId(): string {
		return SessionComparisonEditorInput.EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Readonly;
	}

	override getName(): string {
		return this.sessionComparisonService.getComparison(this.comparisonId)?.title
			?? localize('sessionComparisonEditor.name', "Compare Attempts");
	}

	override getIcon() {
		return Codicon.gitCompare;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput)
			|| otherInput instanceof SessionComparisonEditorInput && otherInput.comparisonId === this.comparisonId;
	}
}

export class SessionComparisonEditorSerializer implements IEditorSerializer {
	canSerialize(editorInput: EditorInput): editorInput is SessionComparisonEditorInput {
		return editorInput instanceof SessionComparisonEditorInput;
	}

	serialize(editorInput: EditorInput): string | undefined {
		return this.canSerialize(editorInput) ? editorInput.comparisonId : undefined;
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		return serializedEditor
			? instantiationService.createInstance(SessionComparisonEditorInput, serializedEditor)
			: undefined;
	}
}
