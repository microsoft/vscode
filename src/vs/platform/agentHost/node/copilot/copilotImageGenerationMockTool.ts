/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tool, ToolExecutionCompleteContent, ToolResultObject } from '@github/copilot-sdk';
import { timeout } from '../../../../base/common/async.js';
import { encodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { CopilotToolName } from './copilotToolDisplay.js';

type ImageGenerationMockResult = ToolResultObject & { contents?: ToolExecutionCompleteContent[] };

export function createImageGenerationMockTool(getCancellationToken: () => CancellationToken, fileService: IFileService, logService: ILogService): Tool<Record<string, unknown>> {
	return {
		name: CopilotToolName.ImageGenerationMock,
		description: 'Preview image-generation rendering with a fixed sample image. Use when the user explicitly asks to test or mock image generation, not to create or edit a real image. The prompt is retained in the tool details but does not change the image. Waits five seconds, makes no network requests, and writes no workspace files. Stop cancels the wait.',
		parameters: {
			type: 'object',
			properties: {
				prompt: { type: 'string', minLength: 1, description: 'The prompt to show in the mock image tool details.' },
			},
			required: ['prompt'],
			additionalProperties: false,
		},
		defer: 'never',
		skipPermission: true,
		handler: async (args, invocation): Promise<ImageGenerationMockResult> => {
			const store = new DisposableStore();
			const cancellation = store.add(new CancellationTokenSource(getCancellationToken()));
			if (invocation.signal) {
				store.add(Event.once(Event.fromDOMEventEmitter(invocation.signal, 'abort'))(() => cancellation.cancel()));
				if (invocation.signal.aborted) {
					cancellation.cancel();
				}
			}
			try {
				if (typeof args?.prompt !== 'string' || !args.prompt.trim() || Object.keys(args).some(key => key !== 'prompt')) {
					throw new Error(localize('imageGenerationMock.invalidInput', "Provide a nonempty prompt to preview image generation."));
				}
				await timeout(5000, cancellation.token);
				const image = await fileService.readFile(FileAccess.asFileUri('vs/platform/agentHost/node/copilot/media/imageGenerationMock.png'), undefined, cancellation.token);
				if (cancellation.token.isCancellationRequested) {
					throw new CancellationError();
				}
				const message = localize('imageGenerationMock.result', "Returned a fixed development sample image. The prompt did not generate or modify this image.");
				return {
					resultType: 'success',
					textResultForLlm: message,
					contents: [
						{ type: 'text', text: message },
						{ type: 'image', data: encodeBase64(image.value), mimeType: 'image/png' },
					],
				};
			} catch (error) {
				const cancelled = cancellation.token.isCancellationRequested || isCancellationError(error);
				const message = cancelled
					? localize('imageGenerationMock.cancelled', "Mock image generation was cancelled.")
					: getErrorMessage(error);
				if (!cancelled) {
					logService.error(error, '[Copilot] Mock image generation failed');
				}
				return { resultType: 'failure', textResultForLlm: message, error: message };
			} finally {
				store.dispose();
			}
		},
	};
}
