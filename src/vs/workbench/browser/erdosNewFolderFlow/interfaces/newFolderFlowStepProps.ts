/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewFolderFlowStep } from './newFolderFlowEnums.js';

export interface NewFolderFlowStepProps {
	cancel: () => void;
	accept: () => void;
	next: (step: NewFolderFlowStep) => void;
	back: () => void;
}
