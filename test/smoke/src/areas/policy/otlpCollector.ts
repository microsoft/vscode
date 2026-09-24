/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as http from 'http';
import { gunzipSync } from 'zlib';

interface OtlpAttribute {
	readonly key: string;
	readonly value?: { readonly stringValue?: string };
}

interface OtlpTraceExport {
	readonly resourceSpans?: readonly {
		readonly resource?: { readonly attributes?: readonly OtlpAttribute[] };
		readonly scopeSpans?: readonly {
			readonly spans?: readonly {
				readonly attributes?: readonly OtlpAttribute[];
				readonly startTimeUnixNano?: string;
				readonly status?: { readonly code?: number | string };
			}[];
		}[];
	}[];
}

/** A strict loopback OTLP/HTTP JSON sink, not a mock telemetry producer. */
export async function startOtlpCollector(headerValue: string) {
	const requests: string[] = [];
	const failures: string[] = [];
	const nativeTurnStarts: bigint[] = [];
	const server = http.createServer((req, res) => {
		const receive = async () => {
			requests.push(`${req.method} ${req.url}`);
			if (req.method !== 'POST' || (req.url !== '/v1/traces' && req.url !== '/v1/metrics')) {
				res.writeHead(404).end();
				req.resume();
				return;
			}
			assert.match(req.headers['content-type'] ?? '', /^application\/json(?:;|$)/);
			const chunks: Buffer[] = [];
			let size = 0;
			for await (const chunk of req) {
				size += chunk.length;
				assert.ok(size <= 1024 * 1024, 'OTLP smoke request exceeded 1 MiB');
				chunks.push(Buffer.from(chunk));
			}
			const body = Buffer.concat(chunks);
			const decoded = req.headers['content-encoding'] === 'gzip'
				? gunzipSync(body, { maxOutputLength: 1024 * 1024 })
				: body;
			const payload: OtlpTraceExport = JSON.parse(decoded.toString('utf8'));
			if (req.url === '/v1/traces') {
				assert.strictEqual(req.headers['x-vscode-smoke-managed'], headerValue, 'Missing or incorrect managed OTel header');
				assert.ok(Array.isArray(payload.resourceSpans), 'Expected an OTLP resourceSpans array');
				for (const resource of payload.resourceSpans) {
					const serviceName = resource.resource?.attributes?.find(attribute => attribute.key === 'service.name')?.value?.stringValue;
					if (serviceName !== 'github-copilot') {
						continue;
					}
					for (const scope of resource.scopeSpans ?? []) {
						for (const span of scope.spans ?? []) {
							const operation = span.attributes?.find(attribute => attribute.key === 'gen_ai.operation.name')?.value?.stringValue;
							const conversation = span.attributes?.find(attribute => attribute.key === 'gen_ai.conversation.id')?.value?.stringValue;
							const failed = span.status?.code === 2 || span.status?.code === 'STATUS_CODE_ERROR';
							if (operation === 'invoke_agent' && conversation && !failed && span.startTimeUnixNano && /^\d+$/.test(span.startTimeUnixNano)) {
								nativeTurnStarts.push(BigInt(span.startTimeUnixNano));
							}
						}
					}
				}
			}
			res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
		};
		void receive().catch(error => {
			failures.push(error instanceof Error ? error.message : String(error));
			res.writeHead(400).end();
			req.resume();
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve();
		});
	});
	server.on('error', error => failures.push(error.message));
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	return {
		endpoint: `http://127.0.0.1:${address.port}`,
		async waitForNativeTurn(startedAfterMs: number, timeoutMs = 30_000): Promise<void> {
			const hasTurn = () => nativeTurnStarts.some(start => start >= BigInt(startedAfterMs) * 1_000_000n);
			const deadline = Date.now() + timeoutMs;
			while (!hasTurn() && failures.length === 0 && Date.now() < deadline) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			assert.deepStrictEqual(failures, [], 'OTLP collector rejected an export');
			assert.ok(hasTurn(), `No native Copilot invoke_agent span received. Requests: ${requests.join(', ') || '(none)'}`);
		},
		async close(): Promise<void> {
			await new Promise<void>((resolve, reject) => {
				server.close(error => error ? reject(error) : resolve());
				server.closeAllConnections();
			});
		},
	};
}
