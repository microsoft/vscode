/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ISuggestSupport} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

export var CONTEXT_SUGGEST_WIDGET_VISIBLE = 'suggestWidgetVisible';
export var CONTEXT_SUGGESTION_SUPPORTS_ACCEPT_ON_KEY = 'suggestionSupportsAcceptOnKey';
export var ACCEPT_SELECTED_SUGGESTION_CMD = 'acceptSelectedSuggestion';

export var SuggestRegistry = new LanguageFeatureRegistry<ISuggestSupport>('suggestSupport');
