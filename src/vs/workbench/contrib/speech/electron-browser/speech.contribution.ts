/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { BuiltinTextToSpeechEngine } from '../browser/builtinTextToSpeech.js';
import '../browser/maiSpeechActions.js';
import { IMaiSpeechCredentialsService, MaiSpeechCredentialsService } from '../browser/maiSpeechCredentials.js';
import { MaiTextToSpeechEngine } from '../browser/maiTextToSpeech.js';
import { registerTextToSpeechEngine } from '../browser/textToSpeechEngineContribution.js';

// Both engines only need `fetch` and Web Audio, so they would run on web too.
// They are registered here rather than alongside the rest of speech because the
// actions that use them live in `chat/electron-browser`: offering the engines
// where nothing can invoke them would advertise a command that is not there.
// Moving those actions out of the desktop-only voice chat file would let this
// move back.
registerSingleton(IMaiSpeechCredentialsService, MaiSpeechCredentialsService, InstantiationType.Delayed);

registerTextToSpeechEngine('workbench.contrib.builtinTextToSpeech', new SyncDescriptor(BuiltinTextToSpeechEngine));
registerTextToSpeechEngine('workbench.contrib.maiTextToSpeech', new SyncDescriptor(MaiTextToSpeechEngine));
