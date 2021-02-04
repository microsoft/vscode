/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Typefox. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import { consumeStream } from 'vs/base/common/stream';
import { generateUuid } from 'vs/base/common/uuid';
import { ALL_SYNC_RESOURCES, IUserData, IUserDataManifest, ServerResource, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';

let session: string | null = null;
interface UserData extends IUserData {
	created: number
}
const data: Map<ServerResource, UserData[]> = new Map<SyncResource, UserData[]>();
const ALL_SERVER_RESOURCES: ServerResource[] = [...ALL_SYNC_RESOURCES, 'machines'];

const server = http.createServer(async (req, res) => {
	if (req.method !== 'OPTIONS') {
		console.log(`${req.method} ${req.url}`);
	}
	if (!req.url) {
		return serveError(req, res, 400, 'Bad Request.');
	}
	try {
		const segments = req.url.split('/');
		segments.shift();
		if (segments.shift() === 'v1') {
			if (req.method === 'GET' && segments.length === 1 && segments[0] === 'manifest') {
				if (session) {
					const latest: Record<ServerResource, string> = Object.create({});
					const manifest: IUserDataManifest = { session, latest };
					data.forEach((value, key) => latest[key] = value[value.length - 1].ref);
					res.writeHead(200, { 'Content-Type': 'application/json' });
					return res.end(JSON.stringify(manifest));
				}
				return serveError(req, res, 204, 'No content.');
			}
			if (req.method === 'GET' && segments.length === 2 && segments[0] === 'resource') {
				const resource = segments[1];
				const resourceKey = ALL_SERVER_RESOURCES.find(key => key === resource);
				if (resourceKey) {
					const resourceData = data.get(resourceKey);
					if (resourceData) {
						const result: { url: string, created: number }[] = resourceData.map(e => ({
							url: e.ref,
							created: e.created
						}));
						res.writeHead(200, { 'Content-Type': 'application/json' });
						return res.end(JSON.stringify(result));
					}
				}
				return serveError(req, res, 204, 'No content.');
			}
			if (req.method === 'GET' && segments.length === 3 && segments[0] === 'resource') {
				const resource = segments[1];
				const resourceKey = ALL_SERVER_RESOURCES.find(key => key === resource);
				if (resourceKey) {
					const entries = data.get(resourceKey);
					let resourceData: UserData | undefined;
					if (segments[2] === 'latest') {
						resourceData = entries?.[entries?.length - 1];
					} else {
						resourceData = entries?.find(e => e.ref === segments[2]);
					}
					if (!resourceData) {
						res.setHeader('etag', '0');
						return serveError(req, res, 204, 'No content.');
					}
					if (req.headers['If-None-Match'] === resourceData.ref) {
						return serveError(req, res, 304, 'Not Modified.');
					}
					res.writeHead(200, { etag: resourceData.ref });
					return res.end(resourceData.content || '');
				}
				return serveError(req, res, 204, 'No content.');
			}
			if (req.method === 'POST' && segments.length === 2 && segments[0] === 'resource') {
				const resource = segments[1];
				if (session) {
					session = generateUuid();
				}
				const resourceKey = ALL_SERVER_RESOURCES.find(key => key === resource);
				if (resourceKey) {
					const entries = data.get(resourceKey) || [];
					const resourceData = entries[entries.length - 1];
					if (req.headers['If-Match'] !== undefined && req.headers['If-Match'] !== (resourceData ? resourceData.ref : '0')) {
						return serveError(req, res, 412, 'Precondition Failed.');
					}
					const content = await consumeStream<string>(req, data => data.join(''));
					const ref = `${parseInt(resourceData?.ref || '0') + 1}`;
					entries.push({ ref, content, created: Date.now() / 1000 });
					data.set(resourceKey, entries);
					res.writeHead(200, { etag: ref });
					return res.end('Ok.');
				}
				return serveError(req, res, 204, 'No content.');
			}
			if (req.method === 'DELETE' && segments.length === 1 && segments[0] === 'resource') {
				data.clear();
				session = null;
				return serveError(req, res, 204, 'No content.');
			}
		}
		if (req.method !== 'OPTIONS') {
			console.error(`${req.method} ${req.url} not found`);
		}
		return serveError(req, res, 404, 'Not found.');
	} catch (e) {
		console.error(e);

		return serveError(req, res, 500, 'Internal Server Error.');
	}
});
server.listen(4000);

function serveError(req: http.IncomingMessage, res: http.ServerResponse, errorCode: number, errorMessage: string): void {
	res.writeHead(errorCode, { 'Content-Type': 'text/plain' });
	res.end(errorMessage);
}
