/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeSitterLibraryService } from '../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { TreeSitterLibraryService } from './treeSitterLibraryService.js';

registerSingleton(ITreeSitterLibraryService, TreeSitterLibraryService, InstantiationType.Eager);
