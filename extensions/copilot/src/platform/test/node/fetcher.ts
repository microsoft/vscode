/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { IHeaders, ReportFetchEvent, Response } from '../../networking/common/fetcherService';


export function createFakeResponse(statusCode: number, response: any = 'body') {
	return Response.fromText(
		statusCode,
		'status text',
		new FakeHeaders(),
		JSON.stringify(response),
		'test-stub'
	);
}

export function createFakeStreamResponse(body: string | string[] | { chunk: string; shouldCancelStream: boolean }[], cts?: CancellationTokenSource, reportEvent: ReportFetchEvent = () => { }): Response {
	const chunks = Array.isArray(body) ? body : [body];
	return new Response(
		200,
		'Success',
		new FakeHeaders(),
		toStream(chunks, cts),
		'test-stub',
		reportEvent,
		'test',
		'test',
	);
}

function toStream(strings: string[] | { chunk: string; shouldCancelStream: boolean }[], cts?: CancellationTokenSource): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	if (strings.length === 0 || typeof strings[0] === 'string') {
		return new ReadableStream({
			start(controller) {
				for (const s of strings) {
					controller.enqueue(encoder.encode(s as string));
				}
				controller.close();
			}
		});
	} else {
		return new ReadableStream({
			start(controller) {
				for (const s of strings) {
					if (typeof s === 'string') {
						controller.enqueue(encoder.encode(s));
					} else {
						controller.enqueue(encoder.encode(s.chunk));
						if (s.shouldCancelStream) {
							cts?.cancel();
						}
					}
				}
				controller.close();
			}
		});
	}
}

export class FakeHeaders implements IHeaders {
	private readonly headers: Map<string, string> = new Map();

	get(name: string): string | null {
		return this.headers.get(name) ?? null;
	}
	[Symbol.iterator](): Iterator<[string, string]> {
		return this.headers.entries();
	}
}
