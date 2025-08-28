/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewFolderFlowStep } from './newFolderFlowEnums.js';

export interface NewFolderFlowStepProps {
	cancel: () => void;
	accept: () => void;
	next: (step: NewFolderFlowStep) => void;
	back: () => void;
}
