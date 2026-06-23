/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Registers the Agents window onboarding tours. The imported modules register
// the tour targets and the tour contribution (which owns the scenario and its
// trigger) as a side effect. The onboarding engine and the spotlight
// presentation live in `vs/workbench/contrib/onboarding` and are booted from
// the workbench contribution imported in the entry point.
import './newSessionButtonTarget.js';
import './newSessionTourContribution.js';
