/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {optional} from 'vs/platform/instantiation/common/instantiation';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import * as modes from 'vs/editor/common/modes';
import {TextualSuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';

// TODO@Alex: inline to FrankensteinMode, review optional IEditorWorkerService
export abstract class AbstractMode implements modes.IMode {

	private _modeId: string;

	constructor(modeId:string) {
		this._modeId = modeId;
	}

	public getId(): string {
		return this._modeId;
	}
}

export class FrankensteinMode extends AbstractMode {

	constructor(
		descriptor: modes.IModeDescriptor,
		@IConfigurationService configurationService: IConfigurationService,
		@optional(IEditorWorkerService) editorWorkerService: IEditorWorkerService
	) {
		super(descriptor.id);

		if (editorWorkerService) {
			modes.SuggestRegistry.register(this.getId(), new TextualSuggestSupport(editorWorkerService, configurationService), true);
		}
	}
}
