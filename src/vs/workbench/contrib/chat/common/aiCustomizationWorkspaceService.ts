/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { PromptsType } from './promptSyntax/promptTypes.js';

export const IAICustomizationWorkspaceService = createDecorator<IAICustomizationWorkspaceService>('aiCustomizationWorkspaceService');

/**
 * Possible section IDs for the AI Customization Management Editor sidebar.
 */
export const AICustomizationManagementSection = {
	Agents: 'agents',
	Skills: 'skills',
	Instructions: 'instructions',
	Prompts: 'prompts',
	Hooks: 'hooks',
	McpServers: 'mcpServers',
	Models: 'models',
} as const;

export type AICustomizationManagementSection = typeof AICustomizationManagementSection[keyof typeof AICustomizationManagementSection];

/**
 * Provides workspace context for AI Customization views.
 */
export interface IAICustomizationWorkspaceService {
	readonly _serviceBrand: undefined;

	/**
	 * Observable that fires when the active project root changes.
	 */
	readonly activeProjectRoot: IObservable<URI | undefined>;

	/**
	 * Returns the current active project root, if any.
	 */
	getActiveProjectRoot(): URI | undefined;

	/**
	 * The sections to show in the AI Customization Management Editor sidebar.
	 */
	readonly managementSections: readonly AICustomizationManagementSection[];

	/**
	 * Whether the primary creation action should create a file directly
	 */
	readonly preferManualCreation: boolean;

	/**
	 * Commits files in the active project.
	 */
	commitFiles(projectRoot: URI, fileUris: URI[]): Promise<void>;

	/**
	 * Launches the AI-guided creation flow for the given customization type.
	 */
	generateCustomization(type: PromptsType): Promise<void>;
}
