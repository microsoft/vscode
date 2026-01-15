/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRenameSymbolTrackerService } from '../../../../editor/browser/services/renameSymbolTrackerService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';


export class RenameSymbolTrackerService extends Disposable implements IRenameSymbolTrackerService {
	public _serviceBrand: undefined;

	constructor(
		@ICodeEditorService public readonly ____codeEditorService: ICodeEditorService
	) {
		super();
	}
}

registerSingleton(IRenameSymbolTrackerService, RenameSymbolTrackerService, InstantiationType.Delayed);
