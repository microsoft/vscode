/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { DiffEditorCommandsService, IDiffEditorCommandsService } from '../../../../workbench/browser/parts/editor/diffEditorCommandsService.js';
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
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(editorService, textResourceConfigurationService, contextKeyService);
	}

	override async toggleRenderSideBySide(args: unknown[]): Promise<void> {
		if (this.editorService.activeEditorPane instanceof SessionChangesEditor) {
			const key = 'diffEditor.renderSideBySide';
			const value = this.configurationService.getValue<boolean>(key) ?? true;
			await this.configurationService.updateValue(key, !value, ConfigurationTarget.WORKSPACE);
			return;
		}
		return super.toggleRenderSideBySide(args);
	}
}

registerSingleton(IDiffEditorCommandsService, SessionsDiffEditorCommandsService, InstantiationType.Delayed);
