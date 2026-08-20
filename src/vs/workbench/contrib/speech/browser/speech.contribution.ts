/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISpeechService } from '../common/speechService.js';
import { BuiltinTextToSpeechEngine } from './builtinTextToSpeech.js';
import './maiSpeechActions.js';
import { IMaiSpeechCredentialsService, MaiSpeechCredentialsService } from './maiSpeechCredentials.js';
import { MaiTextToSpeechEngine } from './maiTextToSpeech.js';
import { SpeechService } from './speechService.js';
import { registerTextToSpeechEngine } from './textToSpeechEngineContribution.js';

registerSingleton(ISpeechService, SpeechService, InstantiationType.Eager /* Reads Extension Points */);
registerSingleton(IMaiSpeechCredentialsService, MaiSpeechCredentialsService, InstantiationType.Delayed);

registerTextToSpeechEngine('workbench.contrib.builtinTextToSpeech', new SyncDescriptor(BuiltinTextToSpeechEngine));
registerTextToSpeechEngine('workbench.contrib.maiTextToSpeech', new SyncDescriptor(MaiTextToSpeechEngine));
