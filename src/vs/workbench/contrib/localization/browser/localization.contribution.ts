/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from 'vs/platform/actions/common/actions';
import { ClearDisplayLanguageAction, ConfigureDisplayLanguageAction } from 'vs/workbench/contrib/localization/browser/localizationsActions';

// Register action to configure locale and related settings
registerAction2(ConfigureDisplayLanguageAction);
registerAction2(ClearDisplayLanguageAction);
