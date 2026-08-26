/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { DiffEditorCommandsService, IDiffEditorCommandsService } from '../../../../workbench/browser/parts/editor/diffEditorCommandsService.js';
import { TextDiffEditor } from '../../../../workbench/browser/parts/editor/textDiffEditor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { SessionChangesEditor } from '../../changes/browser/sessionChangesEditor.js';
import { IDiffEditorOptionsService } from '../common/diffEditorOptionsService.js';
import { DiffEditorOptionsService } from './diffEditorOptionsService.js';

/** Drives the shared preferred diff layout for supported editors in the Agents window. */
export class SessionsDiffEditorCommandsService extends DiffEditorCommandsService {

	constructor(
		@IEditorService editorService: IEditorService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDiffEditorOptionsService private readonly diffEditorOptionsService: IDiffEditorOptionsService,
	) {
		super(editorService, textResourceConfigurationService, contextKeyService);
	}

	override async toggleRenderSideBySide(args: unknown[]): Promise<void> {
		const resource = args[0] instanceof URI ? args[0] : undefined;
		if (resource || !(this.editorService.activeEditorPane instanceof SessionChangesEditor)) {
			for (const pane of [this.editorService.activeEditorPane, ...this.editorService.visibleEditorPanes]) {
				if (!(pane instanceof TextDiffEditor)) {
					continue;
				}

				const control = pane.getControl();
				if (!isDiffEditor(control)) {
					continue;
				}

				const modifiedResource = control.getModifiedEditor().getModel()?.uri;
				if (resource && (!modifiedResource || !isEqual(resource, modifiedResource))) {
					continue;
				}

				this.diffEditorOptionsService.toggleRenderSideBySide();
				return;
			}
		}

		if (this.editorService.activeEditorPane instanceof SessionChangesEditor) {
			this.diffEditorOptionsService.toggleRenderSideBySide();
			return;
		}

		if (resource) {
			this.diffEditorOptionsService.toggleRenderSideBySide();
			return;
		}

		return super.toggleRenderSideBySide(args);
	}
}

export class SessionsDiffEditorLayoutContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.diffEditorLayout';

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IDiffEditorOptionsService private readonly diffEditorOptionsService: IDiffEditorOptionsService,
	) {
		super();
		this._register(this.editorService.onDidActiveEditorChange(() => this.applyLayout()));
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.applyLayout()));
		this._register(autorun(reader => {
			this.diffEditorOptionsService.renderSideBySide.read(reader);
			this.applyLayout();
		}));
	}

	private applyLayout(): void {
		const renderSideBySide = this.diffEditorOptionsService.renderSideBySide.get();
		for (const pane of new Set([this.editorService.activeEditorPane, ...this.editorService.visibleEditorPanes])) {
			if (pane instanceof TextDiffEditor) {
				const control = pane.getControl();
				if (isDiffEditor(control)) {
					control.updateOptions({ renderSideBySide, useInlineViewWhenSpaceIsLimited: true });
				}
			}
		}
	}
}

registerSingleton(IDiffEditorOptionsService, DiffEditorOptionsService, InstantiationType.Delayed);
registerSingleton(IDiffEditorCommandsService, SessionsDiffEditorCommandsService, InstantiationType.Delayed);
registerWorkbenchContribution2(SessionsDiffEditorLayoutContribution.ID, SessionsDiffEditorLayoutContribution, WorkbenchPhase.AfterRestored);
