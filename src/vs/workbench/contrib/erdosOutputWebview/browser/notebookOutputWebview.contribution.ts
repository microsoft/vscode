/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IErdosNotebookOutputWebviewService } from './notebookOutputWebviewService.js';
import { ErdosNotebookOutputWebviewService } from './notebookOutputWebviewServiceImpl.js';

registerSingleton(IErdosNotebookOutputWebviewService,
	ErdosNotebookOutputWebviewService,
	InstantiationType.Delayed);
