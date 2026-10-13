/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './canvases.contribution.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ICanvasContextService } from '../common/canvas.js';
import { EditorCanvasContextService } from './editorCanvasContextService.js';

registerSingleton(ICanvasContextService, EditorCanvasContextService, InstantiationType.Delayed);
