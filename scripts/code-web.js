#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const util = require('util');
const opn = require('opn');
const minimist = require('minimist');

const APP_ROOT = path.dirname(__dirname);
const EXTENSIONS_ROOT = path.join(APP_ROOT, 'extensions');
const WEB_MAIN = path.join(APP_ROOT, 'src', 'vs', 'code', 'browser', 'workbench', 'workbench-dev.html');

const args = minimist(process.argv, {
	boolean: [
		'no-launch',
		'help'
	],
	string: [
		'scheme',
		'host',
		'port',
		'local_port'
	],
});

if (args.help) {
	console.log(
		'yarn web [options]\n' +
		' --no-launch   Do not open VSCode web in the browser\n' +
		' --scheme      Protocol (https or http)\n' +
		' --host        Remote host\n' +
		' --port        Remote/Local port\n' +
		' --local_port  Local port override\n' +
		' --help\n' +
		'[Example]\n' +
		' yarn web --scheme https --host example.com --port 8080 --local_port 30000'
	);
	process.exit(0);
}

const PORT = args.port || process.env.PORT || 8080;
const LOCAL_PORT = args.local_port || process.env.LOCAL_PORT || PORT;
const SCHEME = args.scheme || process.env.VSCODE_SCHEME || 'http';
const HOST = args.host || 'localhost';
const AUTHORITY = process.env.VSCODE_AUTHORITY || `${HOST}:${PORT}`;

const server = http.createServer((req, res) => {
	const parsedUrl = url.parse(req.url, true);
	const pathname = parsedUrl.pathname;

	try {
		if (pathname === '/favicon.ico') {
			// favicon
			return serveFile(req, res, path.join(APP_ROOT, 'resources', 'win32', 'code.ico'));
		}
		if (pathname === '/manifest.json') {
			// manifest
			res.writeHead(200, { 'Content-Type': 'application/json' });
			return res.end(JSON.stringify({
				'name': 'Code Web - OSS',
				'short_name': 'Code Web - OSS',
				'start_url': '/',
				'lang': 'en-US',
				'display': 'standalone'
			}));
		}
		if (/^\/static\//.test(pathname)) {
			// static requests
			return handleStatic(req, res, parsedUrl);
		}
		if (/^\/static-extension\//.test(pathname)) {
			// static extension requests
			return handleStaticExtension(req, res, parsedUrl);
		}
		if (pathname === '/') {
			// main web
			return handleRoot(req, res);
		}

		return serveError(req, res, 404, 'Not found.');
	} catch (error) {
		console.error(error.toString());

		return serveError(req, res, 500, 'Internal Server Error.');
	}
});

server.listen(LOCAL_PORT, () => {
	if (LOCAL_PORT !== PORT) {
		console.log(`Operating location at http://0.0.0.0:${LOCAL_PORT}`);
	}
	console.log(`Web UI available at   ${SCHEME}://${AUTHORITY}`);
});

server.on('error', err => {
	console.error(`Error occurred in server:`);
	console.error(err);
});

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {import('url').UrlWithParsedQuery} parsedUrl
 */
function handleStatic(req, res, parsedUrl) {

	// Strip `/static/` from the path
	const relativeFilePath = path.normalize(decodeURIComponent(parsedUrl.pathname.substr('/static/'.length)));

	return serveFile(req, res, path.join(APP_ROOT, relativeFilePath));
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {import('url').UrlWithParsedQuery} parsedUrl
 */
function handleStaticExtension(req, res, parsedUrl) {

	// Strip `/static-extension/` from the path
	const relativeFilePath = path.normalize(decodeURIComponent(parsedUrl.pathname.substr('/static-extension/'.length)));

	const filePath = path.join(EXTENSIONS_ROOT, relativeFilePath);

	return serveFile(req, res, filePath);
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function handleRoot(req, res) {
	const extensionFolders = await util.promisify(fs.readdir)(EXTENSIONS_ROOT);
	const mapExtensionFolderToExtensionPackageJSON = new Map();

	await Promise.all(extensionFolders.map(async extensionFolder => {
		try {
			const packageJSON = JSON.parse((await util.promisify(fs.readFile)(path.join(EXTENSIONS_ROOT, extensionFolder, 'package.json'))).toString());
			if (packageJSON.main && packageJSON.name !== 'vscode-web-playground') {
				return; // unsupported
			}

			if (packageJSON.name === 'scss') {
				return; // seems to fail to JSON.parse()?!
			}

			packageJSON.extensionKind = ['web']; // enable for Web

			mapExtensionFolderToExtensionPackageJSON.set(extensionFolder, packageJSON);
		} catch (error) {
			return null;
		}
	}));

	const staticExtensions = [];

	// Built in extensions
	mapExtensionFolderToExtensionPackageJSON.forEach((packageJSON, extensionFolder) => {
		staticExtensions.push({
			packageJSON,
			extensionLocation: { scheme: SCHEME, authority: AUTHORITY, path: `/static-extension/${extensionFolder}` }
		});
	});

	const data = (await util.promisify(fs.readFile)(WEB_MAIN)).toString()
		.replace('{{WORKBENCH_WEB_CONFIGURATION}}', escapeAttribute(JSON.stringify({
			staticExtensions,
			folderUri: { scheme: 'memfs', path: `/sample-folder` }
		})))
		.replace('{{WEBVIEW_ENDPOINT}}', '')
		.replace('{{REMOTE_USER_DATA_URI}}', '');

	res.writeHead(200, { 'Content-Type': 'text/html' });
	return res.end(data);
}

/**
 * @param {string} value
 */
function escapeAttribute(value) {
	return value.replace(/"/g, '&quot;');
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} errorMessage
 */
function serveError(req, res, errorCode, errorMessage) {
	res.writeHead(errorCode, { 'Content-Type': 'text/plain' });
	res.end(errorMessage);
}

const textMimeType = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
};

const mapExtToMediaMimes = {
	'.bmp': 'image/bmp',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.jpe': 'image/jpg',
	'.jpeg': 'image/jpg',
	'.jpg': 'image/jpg',
	'.png': 'image/png',
	'.tga': 'image/x-tga',
	'.tif': 'image/tiff',
	'.tiff': 'image/tiff',
	'.woff': 'application/font-woff'
};

/**
 * @param {string} forPath
 */
function getMediaMime(forPath) {
	const ext = path.extname(forPath);

	return mapExtToMediaMimes[ext.toLowerCase()];
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} filePath
 */
async function serveFile(req, res, filePath, responseHeaders = Object.create(null)) {
	try {

		// Sanity checks
		filePath = path.normalize(filePath); // ensure no "." and ".."
		if (filePath.indexOf(`${APP_ROOT}${path.sep}`) !== 0) {
			// invalid location outside of APP_ROOT
			return serveError(req, res, 400, `Bad request.`);
		}

		const stat = await util.promisify(fs.stat)(filePath);

		// Check if file modified since
		const etag = `W/"${[stat.ino, stat.size, stat.mtime.getTime()].join('-')}"`; // weak validator (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag)
		if (req.headers['if-none-match'] === etag) {
			res.writeHead(304);
			return res.end();
		}

		// Headers
		responseHeaders['Content-Type'] = textMimeType[path.extname(filePath)] || getMediaMime(filePath) || 'text/plain';
		responseHeaders['Etag'] = etag;

		res.writeHead(200, responseHeaders);

		// Data
		fs.createReadStream(filePath).pipe(res);
	} catch (error) {
		console.error(error.toString());
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		return res.end('Not found');
	}
}

if (args.launch !== false) {
	opn(`${SCHEME}://${HOST}:${PORT}`);
}
