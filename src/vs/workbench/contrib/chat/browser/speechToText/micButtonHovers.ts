/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IManagedHoverContent } from '../../../../../base/browser/ui/hover/hover.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { DICTATION_MAI_MODEL_ID, DICTATION_MODEL_SETTING } from './chatSpeechToTextService.js';

/**
 * Build a hover with a bold title line and a one-sentence description below it.
 * `title` is the button's label plus keybinding, so it is escaped before being
 * emphasized.
 */
function createMicButtonHover(title: string, description: string): MarkdownString {
	const markdown = new MarkdownString('', { supportThemeIcons: true });
	markdown.appendMarkdown(`**${escapeMarkdownSyntaxTokens(title)}**`);
	markdown.appendMarkdown('\n\n');
	markdown.appendMarkdown(escapeMarkdownSyntaxTokens(description));
	return markdown;
}

/** Wrap a mic-button hover for APIs that take managed hover content. */
function asHoverContent(title: string, description: string): IManagedHoverContent {
	return { markdown: createMicButtonHover(title, description), markdownNotSupportedFallback: `${title}\n${description}` };
}

/**
 * Names the model dictation actually uses, so it is obvious that `dictation.model`
 * governs this button and not Voice Mode (see microsoft/vscode-internalbacklog#8600).
 */
function getDictationDescription(configurationService: IConfigurationService): string {
	const modelId = configurationService.getValue<string>(DICTATION_MODEL_SETTING)?.trim();
	return modelId === DICTATION_MAI_MODEL_ID
		? localize('dictation.hover.cloud', "Types what you say into the input. Transcribes in the cloud with the MAI speech model.")
		: localize('dictation.hover.onDevice', "Types what you say into the input. Transcribes on-device with {0}.", modelId || localize('dictation.hover.defaultModel', "the dictation model"));
}

/**
 * Spells out that Voice Mode is a spoken conversation driven by a separate online
 * model, so it doesn't read as another dictation entry point.
 */
function getVoiceModeDescription(): string {
	return localize('voiceMode.hover', "Talk with the agent and hear it reply. Uses the online real-time voice model.");
}

/** Hover markdown for the dictation mic button. */
export function getDictationHoverMarkdown(title: string, configurationService: IConfigurationService): MarkdownString {
	return createMicButtonHover(title, getDictationDescription(configurationService));
}

/** Hover for the dictation mic button, for APIs that take managed hover content. */
export function getDictationHoverContent(title: string, configurationService: IConfigurationService): IManagedHoverContent {
	return asHoverContent(title, getDictationDescription(configurationService));
}

/** Hover for the Voice Mode button, for APIs that take managed hover content. */
export function getVoiceModeHoverContent(title: string): IManagedHoverContent {
	return asHoverContent(title, getVoiceModeDescription());
}
