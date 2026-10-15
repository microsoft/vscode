/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Electron's `net.fetch` honors a `Range` header on a `file:` URL but answers with status 200, which a media element
 * reads as the whole file. Answers as the partial response it is: 206 with `Content-Range`, or 416 past the end.
 */
export function toPartialFileResponse(request: GlobalRequest, response: GlobalResponse, size: number): GlobalResponse {
	const range = /^bytes=(?<start>\d*)-(?<end>\d*)$/.exec(request.headers.get('range')?.trim() ?? '')?.groups;
	if (!range || response.status !== 200 || (!range.start && !range.end) || (range.start && range.end && Number(range.start) > Number(range.end))) {
		return response;
	}
	const start = range.start ? Number(range.start) : Math.max(0, size - Number(range.end));
	const end = range.start && range.end ? Math.min(Number(range.end), size - 1) : size - 1;
	const headers = new Headers(response.headers);
	headers.set('Accept-Ranges', 'bytes');
	if (start > end) {
		void response.body?.cancel();
		headers.set('Content-Range', `bytes */${size}`);
		return new Response(null, { status: 416, statusText: 'Range Not Satisfiable', headers });
	}
	headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
	headers.set('Content-Length', String(end - start + 1));
	return new Response(response.body, { status: 206, statusText: 'Partial Content', headers });
}
