/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls';
import { BINARY_DIFF_EDITOR_ID } from '../../../common/editor';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IThemeService } from '../../../../platform/theme/common/themeService';
import { SideBySideEditor } from './sideBySideEditor';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { BaseBinaryResourceEditor } from './binaryEditor';
import { IStorageService } from '../../../../platform/storage/common/storage';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService';
import { IEditorService } from '../../../services/editor/common/editorService';

/**
 * An implementation of editor for diffing binary files like images or videos.
 */
export class BinaryResourceDiffEditor extends SideBySideEditor {

	static override readonly ID = BINARY_DIFF_EDITOR_ID;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(group, telemetryService, instantiationService, themeService, storageService, configurationService, textResourceConfigurationService, editorService, editorGroupService);
	}

	getMetadata(): string | undefined {
		const primary = this.getPrimaryEditorPane();
		const secondary = this.getSecondaryEditorPane();

		if (primary instanceof BaseBinaryResourceEditor && secondary instanceof BaseBinaryResourceEditor) {
			return localize('metadataDiff', "{0} ↔ {1}", secondary.getMetadata(), primary.getMetadata());
		}

		return undefined;
	}
}
