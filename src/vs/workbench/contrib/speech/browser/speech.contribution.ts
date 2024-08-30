/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISpeechService } from '../common/speechService.js';
import { SpeechService } from './speechService.js';

registerSingleton(ISpeechService, SpeechService, InstantiationType.Eager /* Reads Extension Points */);
