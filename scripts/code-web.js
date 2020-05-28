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
const webpack = require('webpack');

const APP_ROOT = path.dirname(__dirname);
const EXTENSIONS_ROOT = path.join(APP_ROOT, 'extensions');
const WEB_MAIN = path.join(APP_ROOT, 'src', 'vs', 'code', 'browser', 'workbench', 'workbench-dev.html');

const args = minimist(process.argv, {
	boolean: [
		'watch',
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
		' --watch       Watch extensions that require browser specific builds\n' +
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

const exists = (path) => util.promisify(fs.exists)(path);
const readFile = (path) => util.promisify(fs.readFile)(path);
const CharCode_PC = '%'.charCodeAt(0);

async function initialize() {
	const extensionFolders = await util.promisify(fs.readdir)(EXTENSIONS_ROOT);

	const staticExtensions = [];

	const webpackConfigs = [];

	await Promise.all(extensionFolders.map(async extensionFolder => {
		const packageJSONPath = path.join(EXTENSIONS_ROOT, extensionFolder, 'package.json');
		if (await exists(packageJSONPath)) {
			try {
				const packageJSON = JSON.parse((await readFile(packageJSONPath)).toString());
				if (packageJSON.main && !packageJSON.browser) {
					return; // unsupported
				}

				if (packageJSON.browser) {
					packageJSON.main = packageJSON.browser;
					const webpackConfigPath = path.join(EXTENSIONS_ROOT, extensionFolder, 'extension-browser.webpack.config.js');
					if ((await exists(webpackConfigPath))) {
						const configOrFnOrArray = require(webpackConfigPath);
						function addConfig(configOrFn) {
							if (typeof configOrFn === 'function') {
								webpackConfigs.push(configOrFn({}, {}));
							} else {
								webpackConfigs.push(configOrFn);
							}
						}
						if (Array.isArray(configOrFnOrArray)) {
							configOrFnOrArray.forEach(addConfig);
						} else {
							addConfig(configOrFnOrArray);
						}
					}
				}

				const packageNlsPath = path.join(EXTENSIONS_ROOT, extensionFolder, 'package.nls.json');
				if (await exists(packageNlsPath)) {
					const packageNls = JSON.parse((await readFile(packageNlsPath)).toString());
					const translate = (obj) => {
						for (let key in obj) {
							const val = obj[key];
							if (Array.isArray(val)) {
								val.forEach(translate);
							} else if (val && typeof val === 'object') {
								translate(val);
							} else if (typeof val === 'string' && val.charCodeAt(0) === CharCode_PC && val.charCodeAt(val.length - 1) === CharCode_PC) {
								const translated = packageNls[val.substr(1, val.length - 2)];
								if (translated) {
									obj[key] = translated;
								}
							}
						}
					};
					translate(packageJSON);
				}
				packageJSON.extensionKind = ['web']; // enable for Web
				staticExtensions.push({
					packageJSON,
					extensionLocation: { scheme: SCHEME, authority: AUTHORITY, path: `/static-extension/${extensionFolder}` }
				});
			} catch (e) {
				console.log(e);
			}
		}
	}));

	return new Promise((resolve, reject) => {
		if (args.watch) {
			webpack(webpackConfigs).watch({}, (err, stats) => {
				if (err) {
					console.log(err);
					reject();
				} else {
					console.log(stats.toString());
					resolve(staticExtensions);
				}
			});
		} else {
			webpack(webpackConfigs).run((err, stats) => {
				if (err) {
					console.log(err);
					reject();
				} else {
					console.log(stats.toString());
					resolve(staticExtensions);
				}
			});
		}
	});
}

const staticExtensionsPromise = initialize();

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
	const match = req.url && req.url.match(/\?([^#]+)/);
	let ghPath;
	if (match) {
		const qs = new URLSearchParams(match[1]);
		ghPath = qs.get('gh');
		if (ghPath && !ghPath.startsWith('/')) {
			ghPath = '/' + ghPath;
		}
	}

	const staticExtensions = await staticExtensionsPromise;
	const webConfiguration = escapeAttribute(JSON.stringify({
		staticExtensions, folderUri: ghPath
			? { scheme: 'github', authority: 'github.com', path: ghPath }
			: { scheme: 'memfs', path: `/sample-folder` }
	}));

	const data = (await util.promisify(fs.readFile)(WEB_MAIN)).toString()
		.replace('{{WORKBENCH_WEB_CONFIGURATION}}', () => webConfiguration) // use a replace function to avoid that regexp replace patterns ($&, $0, ...) are applied
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
