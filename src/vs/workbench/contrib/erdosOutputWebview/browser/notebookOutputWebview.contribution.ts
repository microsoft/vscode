/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IErdosNotebookOutputWebviewService } from './notebookOutputWebviewService.js';
import { ErdosNotebookOutputWebviewService } from './notebookOutputWebviewServiceImpl.js';

registerSingleton(IErdosNotebookOutputWebviewService,
	ErdosNotebookOutputWebviewService,
	InstantiationType.Delayed);
