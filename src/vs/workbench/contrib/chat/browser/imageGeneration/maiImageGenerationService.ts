/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { decodeBase64, streamToBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { readImageDimensions } from '../../../../../base/common/image.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IRequestContext, ResponseTooLargeError } from '../../../../../base/parts/request/common/request.js';
import { localize } from '../../../../../nls.js';
import { IRequestService, readHeader, retryAfterFromHeaders } from '../../../../../platform/request/common/request.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { assertImageGenerationEnabled, IGeneratedImage, IImageGenerationConfiguration, IImageGenerationCredentialsService, IImageGenerationRequest, IImageGenerationService, validateImageGenerationRequest } from '../../common/imageGeneration.js';

const maxResponseBytes = 16 * 1024 * 1024;
const requestTimeout = 120_000;

export class MaiImageGenerationService implements IImageGenerationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IImageGenerationCredentialsService private readonly credentialsService: IImageGenerationCredentialsService,
		@IRequestService private readonly requestService: IRequestService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) { }

	async generate(request: IImageGenerationRequest, configuration: IImageGenerationConfiguration, token: CancellationToken): Promise<IGeneratedImage> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		validateImageGenerationRequest(request);
		assertImageGenerationEnabled(this.chatEntitlementService.sentiment.hidden);
		const connection = await this.credentialsService.resolve(configuration);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		assertImageGenerationEnabled(this.chatEntitlementService.sentiment.hidden);
		const store = new DisposableStore();
		const requestCancellation = store.add(new CancellationTokenSource(token));
		let timedOut = false;
		store.add(disposableTimeout(() => {
			timedOut = true;
			requestCancellation.cancel();
		}, requestTimeout));
		let context: IRequestContext | undefined;
		try {
			context = await this.requestService.request({
				type: 'POST',
				url: `${connection.endpoint}/mai/v1/images/generations`,
				headers: { ...connection.headers, 'Content-Type': 'application/json' },
				data: JSON.stringify({ model: connection.deployment, prompt: request.prompt, width: request.width, height: request.height, auto_aspect_ratio: false, web_grounding: false }),
				followRedirects: 0,
				maxResponseBytes,
				timeout: requestTimeout,
				callSite: 'chat.imageGeneration',
			}, requestCancellation.token);
			if (Number(readHeader(context.res.headers, 'content-length')) > maxResponseBytes) {
				throw new ResponseTooLargeError(maxResponseBytes);
			}
			const body = await raceCancellationError(streamToBuffer(context.stream), requestCancellation.token);
			if (body.byteLength > maxResponseBytes) {
				throw new ResponseTooLargeError(maxResponseBytes);
			}
			const text = body.toString();
			const status = context.res.statusCode;
			if (status !== 200) {
				throw imageGenerationRequestError(status, context, text);
			}

			let result: unknown;
			try {
				result = JSON.parse(text);
			} catch {
				throw new Error(localize('imageGeneration.response.json', "The image service returned invalid JSON."));
			}
			const response: { data?: unknown } = typeof result === 'object' && result !== null ? result : {};
			const imageResult: unknown = Array.isArray(response.data) && response.data.length === 1 ? response.data[0] : undefined;
			const encoded: { b64_json?: unknown } = typeof imageResult === 'object' && imageResult !== null ? imageResult : {};
			if (typeof encoded.b64_json !== 'string') {
				throw new Error(localize('imageGeneration.response.missing', "The image service did not return a single PNG image."));
			}
			const base64 = encoded.b64_json;
			if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
				throw new Error(localize('imageGeneration.response.encoding', "The image service returned invalid image data."));
			}
			const data = decodeBase64(base64);
			const dimensions = readImageDimensions(data);
			if (data.byteLength < 8 || data.buffer[0] !== 0x89 || data.buffer[1] !== 0x50
				|| !dimensions || dimensions.width !== request.width || dimensions.height !== request.height) {
				throw new Error(localize('imageGeneration.response.dimensions', "The image service returned an invalid PNG or unexpected image dimensions."));
			}
			try {
				const bitmap = await mainWindow.createImageBitmap(new Blob([new Uint8Array(data.buffer)], { type: 'image/png' }));
				bitmap.close();
			} catch {
				throw new Error(localize('imageGeneration.response.decode', "The generated PNG image could not be decoded."));
			}
			if (requestCancellation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			return { data, mimeType: 'image/png', ...dimensions };
		} catch (error) {
			if (error instanceof ResponseTooLargeError) {
				throw new Error(localize('imageGeneration.response.large', "The image service response exceeds the 16 MB limit."));
			}
			if (timedOut) {
				throw new Error(localize('imageGeneration.error.timeout', "Image generation timed out. No automatic retry was made; the service may already have processed the request."));
			}
			throw error;
		} finally {
			context?.stream.destroy();
			requestCancellation.cancel();
			store.dispose();
		}
	}
}

function imageGenerationRequestError(status: number | undefined, context: IRequestContext, text: string): Error {
	if (status === 401 || status === 403) {
		return new Error(localize('imageGeneration.error.authentication', "The image service rejected the credentials or access to this deployment. Check the image generation setup."));
	}
	if (status === 404) {
		return new Error(localize('imageGeneration.error.deployment', "The image endpoint or deployment was not found. Check the deployment name in the image generation setup."));
	}
	if (status === 429) {
		const retryAfter = retryAfterFromHeaders(context.res.headers);
		return new Error(retryAfter
			? localize('imageGeneration.error.quota.retry', "The image service's quota or rate limit was reached. Wait at least {0} seconds before trying again. No automatic retry was made.", retryAfter)
			: localize('imageGeneration.error.quota', "The image service's quota or rate limit was reached. No automatic retry was made."));
	}
	if (status === 400 && /content_filter|content_policy|ResponsibleAIPolicyViolation/i.test(text)) {
		return new Error(localize('imageGeneration.error.contentPolicy', "The image service declined this request under its content policy."));
	}
	return new Error(localize('imageGeneration.error.request', "Image generation failed (HTTP {0}). No automatic retry was made.", status ?? 'unknown'));
}
