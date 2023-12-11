/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { NativeTitleService } from 'vs/workbench/electron-sandbox/parts/titlebar/titlebarPart';
import { ITitleService } from 'vs/workbench/services/title/browser/titleService';

registerSingleton(ITitleService, NativeTitleService, InstantiationType.Eager);
