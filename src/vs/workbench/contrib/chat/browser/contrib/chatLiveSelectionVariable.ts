/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Location } from 'vs/editor/common/languages';
import { WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { IChatLiveVariable, IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

class ChatLiveSelectionVariable extends Disposable {
	static readonly ID = 'workbench.contrib.chatLiveSelectionVariable';

	private activeEditorListeners = this._register(new DisposableStore());
	private liveSelectionVariable: IChatLiveVariable;
	private onDidChangeSelectionVariable: Emitter<void>;

	constructor(
		@IChatVariablesService chatVariablesService: IChatVariablesService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();

		this.onDidChangeSelectionVariable = this._register(new Emitter<void>({
			// onDidAddFirstListener
		}));
		this.liveSelectionVariable = {
			name: 'currentCode',
			description: '',
			onDidChange: this.onDidChangeSelectionVariable.event,
			value: {
				value: '',
				level: 'full'
			}
		};

		this.updateForEditor();
		this._register(editorService.onDidActiveEditorChange(() => {
			this.updateForEditor();
		}));

		this._register(chatVariablesService.registerLiveVariable(this.liveSelectionVariable));
	}

	private updateForEditor() {
		this.activeEditorListeners.clear();

		const activeTextEditorControl = getCodeEditor(this.editorService.activeTextEditorControl);
		const resource = this.editorService.activeEditorPane?.input.resource;
		if (activeTextEditorControl && resource) {
			const updateValue = () => {
				const selection = activeTextEditorControl.getSelection();
				if (!selection) {
					return;
				}

				if (selection.isEmpty()) {
					const range = activeTextEditorControl.getVisibleRanges()[0];
					this.liveSelectionVariable.value.value = { uri: resource, range } satisfies Location;
				} else {
					this.liveSelectionVariable.value.value = { uri: resource, range: selection } satisfies Location;
				}

				this.onDidChangeSelectionVariable.fire();
			};
			updateValue();
			this.activeEditorListeners.add(activeTextEditorControl.onDidScrollChange(() => updateValue()));
			this.activeEditorListeners.add(activeTextEditorControl.onDidChangeCursorSelection(e => {
				updateValue();
			}));
		}
	}
}

registerWorkbenchContribution2(ChatLiveSelectionVariable.ID, ChatLiveSelectionVariable, WorkbenchPhase.Eventually);
