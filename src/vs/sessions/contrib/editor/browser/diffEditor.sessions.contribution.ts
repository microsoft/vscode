/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { DiffEditorCommandsService, IDiffEditorCommandsService } from '../../../../workbench/browser/parts/editor/diffEditorCommandsService.js';
import { TextDiffEditor } from '../../../../workbench/browser/parts/editor/textDiffEditor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { SessionChangesEditor } from '../../changes/browser/sessionChangesEditor.js';

/**
 * Agents window implementation that also drives the multi-diff Changes editor. Unlike a single
 * diff editor, it has no single modified resource, so the render mode is toggled via the
 * workspace `diffEditor.renderSideBySide` setting, which the Changes editor observes.
 */
export class SessionsDiffEditorCommandsService extends DiffEditorCommandsService {

	constructor(
		@IEditorService editorService: IEditorService,
		@ITextResourceConfigurationService private readonly sessionsTextResourceConfigurationService: ITextResourceConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(editorService, sessionsTextResourceConfigurationService, contextKeyService);
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

				const renderSideBySide = !control.renderSideBySide;
				if (modifiedResource) {
					await this.sessionsTextResourceConfigurationService.updateValue(modifiedResource, 'diffEditor.renderSideBySide', renderSideBySide);
				}
				control.updateOptions({ renderSideBySide, useInlineViewWhenSpaceIsLimited: false });
				return;
			}
		}

		if (this.editorService.activeEditorPane instanceof SessionChangesEditor) {
			const key = 'diffEditor.renderSideBySide';
			const value = this.configurationService.getValue<boolean>(key) ?? true;
			await this.configurationService.updateValue(key, !value, ConfigurationTarget.WORKSPACE);
			return;
		}

		if (resource) {
			const key = 'diffEditor.renderSideBySide';
			const value = this.sessionsTextResourceConfigurationService.getValue<boolean>(resource, key);
			await this.sessionsTextResourceConfigurationService.updateValue(resource, key, !value);
			return;
		}

		return super.toggleRenderSideBySide(args);
	}
}

registerSingleton(IDiffEditorCommandsService, SessionsDiffEditorCommandsService, InstantiationType.Delayed);
