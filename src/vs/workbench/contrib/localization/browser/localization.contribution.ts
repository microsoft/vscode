/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { WebLocaleService } from 'vs/workbench/contrib/localization/browser/localeService';
import { ClearDisplayLanguageAction, ConfigureDisplayLanguageAction } from 'vs/workbench/contrib/localization/browser/localizationsActions';
import { ILocaleService } from 'vs/workbench/contrib/localization/common/locale';

registerSingleton(ILocaleService, WebLocaleService, true);

// Register action to configure locale and related settings
registerAction2(ConfigureDisplayLanguageAction);
registerAction2(ClearDisplayLanguageAction);
