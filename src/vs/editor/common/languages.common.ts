/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// base common
import 'vs/base/common/assert';
import 'vs/base/common/async';
import 'vs/base/common/callbackList';
import 'vs/base/common/cancellation';
import 'vs/base/common/collections';
import 'vs/base/common/event';
import 'vs/base/common/events';
import 'vs/base/common/lifecycle';
import 'vs/base/common/paths';
import 'vs/base/common/uri';

// platform common
import 'vs/platform/platform';
import 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import 'vs/platform/workspace/common/workspace';
import 'vs/platform/telemetry/common/telemetry';

// editor common
import 'vs/editor/common/editorCommon';
import 'vs/editor/common/modes';
import 'vs/editor/common/modes/abstractMode';
import 'vs/editor/common/modes/abstractState';
import 'vs/editor/common/modes/monarch/monarchCommon';
import 'vs/editor/common/modes/monarch/monarchLexer';
import 'vs/editor/common/modes/monarch/monarchCompile';
import 'vs/editor/common/modes/languageConfigurationRegistry';
import 'vs/editor/common/modes/supports/suggestSupport';
import 'vs/editor/common/modes/supports/tokenizationSupport';
import 'vs/editor/common/services/modelService';
import 'vs/editor/common/services/modeService';
import 'vs/editor/common/services/compatWorkerService';
