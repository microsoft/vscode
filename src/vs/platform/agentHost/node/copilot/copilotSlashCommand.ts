/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession } from '@github/copilot-sdk';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';

export type RuntimeSlashCommandInfo = Awaited<ReturnType<CopilotSession['rpc']['commands']['list']>>['commands'][number];
export type CopilotSlashCommandInvocation = Parameters<CopilotSession['rpc']['commands']['invoke']>[0];
export type CopilotSlashCommandResult = Awaited<ReturnType<CopilotSession['rpc']['commands']['invoke']>>;

export type CopilotSlashCommandOutput =
	| { readonly kind: 'text'; readonly text: string; readonly markdown?: boolean }
	| { readonly kind: 'link'; readonly resource: URI; readonly label: string; readonly preview?: boolean };

/** Host-side behavior attached to a resolved command, separate from SDK catalog metadata. */
export interface ICopilotSlashCommandHandler {
	/** Returning undefined preserves the SDK command name and raw input. */
	readonly getInvocation?: (input: string) => CopilotSlashCommandInvocation | undefined;
	/** Returning undefined preserves the SDK result's existing rendering and lifecycle. */
	readonly getOutput?: (input: string, result: CopilotSlashCommandResult) => CopilotSlashCommandOutput | undefined | Promise<CopilotSlashCommandOutput | undefined>;
}

export type ResolvedCopilotSlashCommand = RuntimeSlashCommandInfo & ICopilotSlashCommandHandler;

export function renderCopilotSlashCommandOutput(output: CopilotSlashCommandOutput): string {
	if (output.kind === 'text') {
		return output.markdown === true ? output.text : escapeMarkdownSyntaxTokens(output.text);
	}

	let resource = output.resource;
	if (output.preview) {
		const query = new URLSearchParams(resource.query);
		query.set('vscodeLinkType', 'markdown-preview');
		resource = resource.with({ query: query.toString() });
	}
	return new MarkdownString().appendLink(resource, output.label).value;
}
