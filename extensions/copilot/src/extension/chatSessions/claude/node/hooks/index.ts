/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Import common hooks first to trigger self-registration
import '../../common/hooks/index';

// Import all node-specific hook modules to trigger self-registration
import './loggingHooks';
import './sessionHooks';
import './subagentHooks';
import './toolHooks';
