/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { BINARY_DIFF_EDITOR_ID } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { BaseBinaryResourceEditor } from 'vs/workbench/browser/parts/editor/binaryEditor';

/**
 * An implementation of editor for diffing binary files like images or videos.
 */
export class BinaryResourceDiffEditor extends SideBySideEditor {

	public static ID = BINARY_DIFF_EDITOR_ID;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(telemetryService, instantiationService, themeService);
	}

	public getMetadata(): string {
		const master = this.masterEditor;
		const details = this.detailsEditor;

		if (master instanceof BaseBinaryResourceEditor && details instanceof BaseBinaryResourceEditor) {
			return nls.localize('metadataDiff', "{0} ↔ {1}", details.getMetadata(), master.getMetadata());
		}

		return null;
	}
}
