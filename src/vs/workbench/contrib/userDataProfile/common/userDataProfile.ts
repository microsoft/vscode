/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IUserDataProfile } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IEditorPane } from '../../../common/editor.js';

export interface IUserDataProfilesEditor extends IEditorPane {
	createNewProfile(copyFrom?: URI | IUserDataProfile): Promise<void>;
	selectProfile(profile: IUserDataProfile): void;
}
