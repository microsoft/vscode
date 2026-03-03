/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { encodeBase64 } from '../../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TerminalSettingId } from '../../../../../../platform/terminal/common/terminal.js';
import { ToolDataSource, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type CountTokensCallback, type ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { TerminalToolId } from './toolIds.js';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const KITTY_CHUNK_SIZE = 4096; // Base64 chunk size for kitty protocol

export const DisplayImageInTerminalToolData: IToolData = {
	id: TerminalToolId.DisplayImageInTerminal,
	toolReferenceName: 'displayImageInTerminal',
	displayName: localize('displayImageInTerminalTool.displayName', 'Display Image in Terminal'),
	modelDescription: 'Display an image file inline in the active terminal using the kitty graphics protocol. Use this after generating an image file (e.g. a chart saved as PNG via matplotlib) to show it to the user directly in the terminal. Supports PNG, JPEG, and GIF files.',
	userDescription: localize('displayImageInTerminalTool.userDescription', 'Display an image file inline in the terminal'),
	source: ToolDataSource.Internal,
	icon: Codicon.terminal,
	inputSchema: {
		type: 'object',
		properties: {
			filePath: {
				type: 'string',
				description: 'The absolute path to the image file to display (PNG, JPEG, or GIF).',
			},
		},
		required: ['filePath'],
	},
};

interface IDisplayImageInTerminalInput {
	filePath: string;
}

export class DisplayImageInTerminalTool extends Disposable implements IToolImpl {

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IFileService private readonly _fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('displayImageInTerminal.progressive', "Displaying image in terminal"),
			pastTenseMessage: localize('displayImageInTerminal.past', "Displayed image in terminal"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IDisplayImageInTerminalInput;

		if (!args.filePath) {
			return { content: [{ kind: 'text', value: 'No file path provided.' }] };
		}

		// Get the active terminal
		const activeInstance = this._terminalService.activeInstance;
		if (!activeInstance) {
			return { content: [{ kind: 'text', value: 'No active terminal instance found.' }] };
		}

		// Ensure enableImages is on
		const enableImages = this._configurationService.getValue<boolean>(TerminalSettingId.EnableImages);
		if (!enableImages) {
			await this._configurationService.updateValue(TerminalSettingId.EnableImages, true);
		}

		// Read the image file
		const fileUri = URI.file(args.filePath);
		try {
			const stat = await this._fileService.stat(fileUri);
			if (stat.size > MAX_IMAGE_SIZE) {
				return { content: [{ kind: 'text', value: `Image file is too large (${Math.round(stat.size / 1024 / 1024)}MB). Maximum supported size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB.` }] };
			}
		} catch {
			return { content: [{ kind: 'text', value: `Failed to read image file: ${args.filePath}` }] };
		}

		const fileContent = (await this._fileService.readFile(fileUri)).value;

		// Base64 encode the image
		const base64Encoded = encodeBase64(fileContent);

		// Wait for xterm to be ready
		const xterm = await activeInstance.xtermReadyPromise;
		if (!xterm) {
			return { content: [{ kind: 'text', value: 'Terminal renderer is not ready.' }] };
		}

		// Write the kitty graphics protocol escape sequence to the terminal
		// For large images, use chunked transfer (m=1 means more data, m=0 means last chunk)
		if (base64Encoded.length <= KITTY_CHUNK_SIZE) {
			// Small image: single transmission
			xterm.raw.write(`\x1b_Ga=T,f=100;${base64Encoded}\x1b\\`);
		} else {
			// Large image: chunked transmission
			let offset = 0;
			let isFirst = true;
			while (offset < base64Encoded.length) {
				const chunk = base64Encoded.substring(offset, offset + KITTY_CHUNK_SIZE);
				const isLast = offset + KITTY_CHUNK_SIZE >= base64Encoded.length;

				if (isFirst) {
					xterm.raw.write(`\x1b_Ga=T,f=100,m=${isLast ? 0 : 1};${chunk}\x1b\\`);
					isFirst = false;
				} else {
					xterm.raw.write(`\x1b_Gm=${isLast ? 0 : 1};${chunk}\x1b\\`);
				}
				offset += KITTY_CHUNK_SIZE;
			}
		}

		// Write a newline after the image
		xterm.raw.write('\r\n');

		return {
			content: [{
				kind: 'text',
				value: `Image displayed in terminal: ${args.filePath}`,
			}],
		};
	}
}
