/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TitlebarPart } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';

// Registers the title bar part as title service
registerSingleton(ITitleService, TitlebarPart);
