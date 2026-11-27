/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Root config key: whether model routers are offered as models. */
export const ModelRouterEnabledConfigKey = 'modelRouter.enabled';
export const ModelRouterEnabledSettingId = 'chat.copilot.modelRouter.enabled';
/** Root config key: the decision model that routes turns. */
export const ModelRouterDecisionModelConfigKey = 'modelRouter.decisionModel';
export const ModelRouterDecisionModelSettingId = 'chat.copilot.modelRouter.decisionModel';
/** The decision model that routes turns when the setting names none. */
export const MODEL_ROUTER_DEFAULT_DECISION_MODEL = 'gpt-6-luna-decisions';
/** The built-in skill that writes and checks model routers, which a chat runs as `/model-router`. */
export const ModelRouterSkillName = 'model-router';
