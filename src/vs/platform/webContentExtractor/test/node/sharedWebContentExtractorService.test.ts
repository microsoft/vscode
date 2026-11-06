/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SharedWebContentExtractorService } from '../../node/sharedWebContentExtractorService.js';

suite('Shared web content image extraction', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"/>';
	let server: Server;
	let resource: URI;
	let contentType: string;
	let statusCode: number;
	let requests: number;
	let body: string | Uint8Array;
	const service = new SharedWebContentExtractorService();

	setup(async () => {
		const { createServer } = await import('http');
		contentType = 'image/svg+xml; charset=utf-8';
		statusCode = 200;
		requests = 0;
		body = svg;
		server = createServer((_request, response) => {
			requests++;
			response.writeHead(statusCode, { 'Content-Type': contentType });
			response.end(body);
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		resource = URI.parse(`http://127.0.0.1:${(server.address() as AddressInfo).port}/image-without-extension`);
	});

	teardown(async () => {
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	});

	test('reads cross-origin SVG bytes and MIME metadata without an Access-Control-Allow-Origin header', async () => {
		const result = await service.readImageWithMetadata(resource, CancellationToken.None);
		assert.deepStrictEqual({ data: result?.data.toString(), mimeType: result?.mimeType }, { data: svg, mimeType: 'image/svg+xml' });
	});

	test('preserves the existing byte-only API', async () => {
		contentType = 'image/png';
		body = decodeBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a79cAAAAASUVORK5CYII=').buffer;
		assert.deepStrictEqual(await service.readImage(resource, CancellationToken.None), VSBuffer.wrap(body));
	});

	test('allows the decoder to read raster image bytes served as application/octet-stream', async () => {
		contentType = 'application/octet-stream';
		body = decodeBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a79cAAAAASUVORK5CYII=').buffer;
		const result = await service.readImageWithMetadata(resource, CancellationToken.None);
		assert.deepStrictEqual(result, { data: VSBuffer.wrap(body), mimeType: contentType });
	});

	test('reports failed HTTP requests', async () => {
		statusCode = 404;
		await assert.rejects(service.readImageWithMetadata(resource, CancellationToken.None), /Image request failed \(404\)/);
	});

	test('rejects non-image responses', async () => {
		contentType = 'text/html';
		await assert.rejects(service.readImageWithMetadata(resource, CancellationToken.None), /not a supported image/);
	});

	test('does not fetch a cancelled image', async () => {
		const result = await service.readImageWithMetadata(resource, CancellationToken.Cancelled);
		assert.deepStrictEqual({ result, requests }, { result: undefined, requests: 0 });
	});
});
