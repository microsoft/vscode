/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INotebookZoneManager } from '../common/notebookZoneManager.js';
import { NotebookZoneManager } from './notebookZoneManager.js';

registerSingleton(INotebookZoneManager, NotebookZoneManager, InstantiationType.Delayed);
