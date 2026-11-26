/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { PromptsType } from '../promptTypes.js';
import { IExtensionPromptPath, IPromptFileContext, IPromptFileResource } from './promptsService.js';

export const IChatExtensionCustomizationsService = createDecorator<IChatExtensionCustomizationsService>('chatExtensionCustomizationsService');

/**
 * Event payload emitted by {@link IChatExtensionCustomizationsService.onDidChange}.
 */
export interface IExtensionPromptFilesChangeEvent {
	readonly type: PromptsType;
}

/**
 * Owns the customization files (agents, skills, instructions, prompts and hooks) that extensions contribute, through
 * static contribution points or through the provider API.
 *
 * Independent of any harness: the local chat harness and agent hosts consume it alike.
 */
export interface IChatExtensionCustomizationsService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires with the affected type when contributions or providers change, or when a `when` clause re-evaluates.
	 */
	readonly onDidChange: Event<IExtensionPromptFilesChangeEvent>;

	/**
	 * Returns the extension-contributed files of the given type whose `when` clause matches.
	 */
	getExtensionPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IExtensionPromptPath[]>;

	/**
	 * Registers a file contributed through a static contribution point.
	 */
	registerContributedFile(type: PromptsType, uri: URI, extension: IExtensionDescription, name: string | undefined, description: string | undefined, when?: string, sessionTypes?: readonly string[]): IDisposable;

	/**
	 * Registers a provider (custom agent, instructions, prompt file, skill or hook provider) from the extension API.
	 */
	registerPromptFileProvider(extension: IExtensionDescription, type: PromptsType, provider: {
		onDidChangePromptFiles?: Event<void>;
		providePromptFiles: (context: IPromptFileContext, token: CancellationToken) => Promise<IPromptFileResource[] | undefined>;
	}): IDisposable;
}
