/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IModeDescriptor} from 'vs/editor/common/modes';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {OutputWorker} from 'vs/workbench/parts/output/common/outputWorker';
import {TPromise} from 'vs/base/common/winjs.base';
import {CompatWorkerAttr} from 'vs/platform/thread/common/threadService';
import URI from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {AbstractMode, ModeWorkerManager} from 'vs/editor/common/modes/abstractMode';
import {wireCancellationToken} from 'vs/base/common/async';

export class OutputMode extends AbstractMode {

	private _modeWorkerManager: ModeWorkerManager<OutputWorker>;

	constructor(
		descriptor: IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(descriptor.id);
		this._modeWorkerManager = new ModeWorkerManager<OutputWorker>(descriptor, 'vs/workbench/parts/output/common/outputWorker', 'OutputWorker', null, instantiationService);

		modes.LinkProviderRegistry.register(this.getId(), {
			provideLinks: (model, token): Thenable<modes.ILink[]> => {
				return wireCancellationToken(token, this._provideLinks(model.uri));
			}
		});
	}

	private _worker<T>(runner: (worker: OutputWorker) => TPromise<T>): TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	static $_provideLinks = CompatWorkerAttr(OutputMode, OutputMode.prototype._provideLinks);
	private _provideLinks(resource: URI): TPromise<modes.ILink[]> {
		return this._worker((w) => w.provideLinks(resource));
	}
}