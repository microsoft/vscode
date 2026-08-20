/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IBuiltinTextToSpeechEngine, ISpeechService } from '../common/speechService.js';

/**
 * Registers a text-to-speech engine so that reading responses aloud works
 * without an extension providing speech. Engines are registered per target
 * environment, and the one with the highest priority that is supported wins.
 */
export function registerTextToSpeechEngine(id: string, engine: SyncDescriptor<IBuiltinTextToSpeechEngine>): void {
	class TextToSpeechEngineContribution extends Disposable {
		constructor(
			@ISpeechService speechService: ISpeechService,
			@IInstantiationService instantiationService: IInstantiationService
		) {
			super();

			this._register(speechService.registerBuiltinTextToSpeechEngine(instantiationService.createInstance(engine)));
		}
	}

	registerWorkbenchContribution2(id, TextToSpeechEngineContribution, WorkbenchPhase.AfterRestored);
}
