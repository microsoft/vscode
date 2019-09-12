/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { FloatingClickWidget } from 'vs/workbench/browser/parts/editor/editorWidgets';
import { localize } from 'vs/nls';
import { IUserDataSyncService, SETTINGS_PREVIEW_RESOURCE } from 'vs/workbench/services/userData/common/userData';
import { isEqual } from 'vs/base/common/resources';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

export class AcceptChangesController extends Disposable implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.sync.acceptChanges';

	static get(editor: ICodeEditor): AcceptChangesController {
		return editor.getContribution<AcceptChangesController>(AcceptChangesController.ID);
	}

	private readonly acceptChangesWidgetRenderer: MutableDisposable<AcceptChangesWidgetRenderer>;

	constructor(
		private editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.acceptChangesWidgetRenderer = this._register(new MutableDisposable<AcceptChangesWidgetRenderer>());
		this._register(this.editor.onDidChangeModel(() => this.update()));
		this.update();
	}

	getId(): string {
		return AcceptChangesController.ID;
	}

	private update(): void {
		if (this.isInterestingEditorModel()) {
			if (!this.acceptChangesWidgetRenderer.value) {
				this.acceptChangesWidgetRenderer.value = this.instantiationService.createInstance(AcceptChangesWidgetRenderer, this.editor);
			}
		} else {
			this.acceptChangesWidgetRenderer.clear();
		}
	}

	private isInterestingEditorModel(): boolean {
		const model = this.editor.getModel();
		if (!model) {
			return false;
		}
		return isEqual(model.uri, SETTINGS_PREVIEW_RESOURCE, false);
	}
}

export class AcceptChangesWidgetRenderer extends Disposable {

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();

		const floatingClickWidget = this._register(instantiationService.createInstance(FloatingClickWidget, editor, localize('Accept', "Accept & Sync"), null));
		this._register(floatingClickWidget.onClick(() => this.acceptChanges()));
		floatingClickWidget.render();
	}

	private async acceptChanges(): Promise<void> {
		// Do not accept if editor is readonly
		if (this.editor.getOption(EditorOption.readOnly)) {
			return;
		}

		const model = this.editor.getModel();
		if (model) {
			// Disable updating
			this.editor.updateOptions({ readOnly: true });
			// Save the preview
			await this.textFileService.save(model.uri);

			try {
				// Apply Preview
				await this.userDataSyncService.apply(model.uri);
			} catch (error) {
				this.notificationService.error(error);
				// Enable updating
				this.editor.updateOptions({ readOnly: false });
				return;
			}

			// Close all preview editors
			const editorInputs = this.editorService.editors.filter(input => isEqual(input.getResource(), model.uri));
			for (const input of editorInputs) {
				input.dispose();
			}
		}

	}
}
