"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoopbackAuthServer = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const http = require("http");
const url_1 = require("url");
const fs = require("fs");
const path = require("path");
const crypto_1 = require("crypto");
function sendFile(res, filepath) {
    fs.readFile(filepath, (err, body) => {
        if (err) {
            console.error(err);
            res.writeHead(404);
            res.end();
        }
        else {
            res.writeHead(200, {
                'content-length': body.length,
            });
            res.end(body);
        }
    });
}
class LoopbackAuthServer {
    set state(state) {
        if (state) {
            this._startingRedirect.searchParams.set('state', state);
        }
        else {
            this._startingRedirect.searchParams.delete('state');
        }
    }
    get state() {
        return this._startingRedirect.searchParams.get('state') ?? undefined;
    }
    constructor(serveRoot, startingRedirect) {
        this.nonce = (0, crypto_1.randomBytes)(16).toString('base64');
        if (!serveRoot) {
            throw new Error('serveRoot must be defined');
        }
        if (!startingRedirect) {
            throw new Error('startingRedirect must be defined');
        }
        this._startingRedirect = new url_1.URL(startingRedirect);
        let deferred;
        this._resultPromise = new Promise((resolve, reject) => deferred = { resolve, reject });
        this._server = http.createServer((req, res) => {
            const reqUrl = new url_1.URL(req.url, `http://${req.headers.host}`);
            switch (reqUrl.pathname) {
                case '/signin': {
                    const receivedNonce = (reqUrl.searchParams.get('nonce') ?? '').replace(/ /g, '+');
                    if (receivedNonce !== this.nonce) {
                        res.writeHead(302, { location: `/?error=${encodeURIComponent('Nonce does not match.')}` });
                        res.end();
                    }
                    res.writeHead(302, { location: this._startingRedirect.toString() });
                    res.end();
                    break;
                }
                case '/callback': {
                    const code = reqUrl.searchParams.get('code') ?? undefined;
                    const state = reqUrl.searchParams.get('state') ?? undefined;
                    const nonce = (reqUrl.searchParams.get('nonce') ?? '').replace(/ /g, '+');
                    if (!code || !state || !nonce) {
                        res.writeHead(400);
                        res.end();
                        return;
                    }
                    if (this.state !== state) {
                        res.writeHead(302, { location: `/?error=${encodeURIComponent('State does not match.')}` });
                        res.end();
                        throw new Error('State does not match.');
                    }
                    if (this.nonce !== nonce) {
                        res.writeHead(302, { location: `/?error=${encodeURIComponent('Nonce does not match.')}` });
                        res.end();
                        throw new Error('Nonce does not match.');
                    }
                    deferred.resolve({ code, state });
                    res.writeHead(302, { location: '/' });
                    res.end();
                    break;
                }
                // Serve the static files
                case '/':
                    sendFile(res, path.join(serveRoot, 'index.html'));
                    break;
                default:
                    // substring to get rid of leading '/'
                    sendFile(res, path.join(serveRoot, reqUrl.pathname.substring(1)));
                    break;
            }
        });
    }
    start() {
        return new Promise((resolve, reject) => {
            if (this._server.listening) {
                throw new Error('Server is already started');
            }
            const portTimeout = setTimeout(() => {
                reject(new Error('Timeout waiting for port'));
            }, 5000);
            this._server.on('listening', () => {
                const address = this._server.address();
                if (typeof address === 'string') {
                    this.port = parseInt(address);
                }
                else if (address instanceof Object) {
                    this.port = address.port;
                }
                else {
                    throw new Error('Unable to determine port');
                }
                clearTimeout(portTimeout);
                // set state which will be used to redirect back to vscode
                this.state = `http://127.0.0.1:${this.port}/callback?nonce=${encodeURIComponent(this.nonce)}`;
                resolve(this.port);
            });
            this._server.on('error', err => {
                reject(new Error(`Error listening to server: ${err}`));
            });
            this._server.on('close', () => {
                reject(new Error('Closed'));
            });
            this._server.listen(0, '127.0.0.1');
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            if (!this._server.listening) {
                throw new Error('Server is not started');
            }
            this._server.close((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    waitForOAuthResponse() {
        return this._resultPromise;
    }
}
exports.LoopbackAuthServer = LoopbackAuthServer;
