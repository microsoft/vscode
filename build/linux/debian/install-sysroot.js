"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVSCodeSysroot = getVSCodeSysroot;
exports.getChromiumSysroot = getChromiumSysroot;
const child_process_1 = require("child_process");
const os_1 = require("os");
const fs = require("fs");
const https = require("https");
const path = require("path");
const crypto_1 = require("crypto");
const ansiColors = require("ansi-colors");
// Based on https://source.chromium.org/chromium/chromium/src/+/main:build/linux/sysroot_scripts/install-sysroot.py.
const URL_PREFIX = 'https://msftelectron.blob.core.windows.net';
const URL_PATH = 'sysroots/toolchain';
const REPO_ROOT = path.dirname(path.dirname(path.dirname(__dirname)));
const ghApiHeaders = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'VSCode Build',
};
if (process.env.GITHUB_TOKEN) {
    ghApiHeaders.Authorization = 'Basic ' + Buffer.from(process.env.GITHUB_TOKEN).toString('base64');
}
const ghDownloadHeaders = {
    ...ghApiHeaders,
    Accept: 'application/octet-stream',
};
function getElectronVersion() {
    const npmrc = fs.readFileSync(path.join(REPO_ROOT, '.npmrc'), 'utf8');
    const electronVersion = /^target="(.*)"$/m.exec(npmrc)[1];
    const msBuildId = /^ms_build_id="(.*)"$/m.exec(npmrc)[1];
    return { electronVersion, msBuildId };
}
function getSha(filename) {
    // CodeQL [SM04514] Hash logic cannot be changed due to external dependency, also the code is only used during build.
    const hash = (0, crypto_1.createHash)('sha1');
    // Read file 1 MB at a time
    const fd = fs.openSync(filename, 'r');
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position)) === buffer.length) {
        hash.update(buffer);
        position += bytesRead;
    }
    hash.update(buffer.slice(0, bytesRead));
    return hash.digest('hex');
}
function getVSCodeSysrootChecksum(expectedName) {
    const checksums = fs.readFileSync(path.join(REPO_ROOT, 'build', 'checksums', 'vscode-sysroot.txt'), 'utf8');
    for (const line of checksums.split('\n')) {
        const [checksum, name] = line.split(/\s+/);
        if (name === expectedName) {
            return checksum;
        }
    }
    return undefined;
}
/*
 * Do not use the fetch implementation from build/lib/fetch as it relies on vinyl streams
 * and vinyl-fs breaks the symlinks in the compiler toolchain sysroot. We use the native
 * tar implementation for that reason.
 */
async function fetchUrl(options, retries = 10, retryDelay = 1000) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30 * 1000);
        const version = '20240129-253798';
        try {
            const response = await fetch(`https://api.github.com/repos/Microsoft/vscode-linux-build-agent/releases/tags/v${version}`, {
                headers: ghApiHeaders,
                signal: controller.signal /* Typings issue with lib.dom.d.ts */
            });
            if (response.ok && (response.status >= 200 && response.status < 300)) {
                console.log(`Fetch completed: Status ${response.status}.`);
                const contents = Buffer.from(await response.arrayBuffer());
                const asset = JSON.parse(contents.toString()).assets.find((a) => a.name === options.assetName);
                if (!asset) {
                    throw new Error(`Could not find asset in release of Microsoft/vscode-linux-build-agent @ ${version}`);
                }
                console.log(`Found asset ${options.assetName} @ ${asset.url}.`);
                const assetResponse = await fetch(asset.url, {
                    headers: ghDownloadHeaders
                });
                if (assetResponse.ok && (assetResponse.status >= 200 && assetResponse.status < 300)) {
                    const assetContents = Buffer.from(await assetResponse.arrayBuffer());
                    console.log(`Fetched response body buffer: ${ansiColors.magenta(`${assetContents.byteLength} bytes`)}`);
                    if (options.checksumSha256) {
                        const actualSHA256Checksum = (0, crypto_1.createHash)('sha256').update(assetContents).digest('hex');
                        if (actualSHA256Checksum !== options.checksumSha256) {
                            throw new Error(`Checksum mismatch for ${ansiColors.cyan(asset.url)} (expected ${options.checksumSha256}, actual ${actualSHA256Checksum}))`);
                        }
                    }
                    console.log(`Verified SHA256 checksums match for ${ansiColors.cyan(asset.url)}`);
                    const tarCommand = `tar -xz -C ${options.dest}`;
                    (0, child_process_1.execSync)(tarCommand, { input: assetContents });
                    console.log(`Fetch complete!`);
                    return;
                }
                throw new Error(`Request ${ansiColors.magenta(asset.url)} failed with status code: ${assetResponse.status}`);
            }
            throw new Error(`Request ${ansiColors.magenta('https://api.github.com')} failed with status code: ${response.status}`);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (e) {
        if (retries > 0) {
            console.log(`Fetching failed: ${e}`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return fetchUrl(options, retries - 1, retryDelay);
        }
        throw e;
    }
}
async function getVSCodeSysroot(arch) {
    let expectedName;
    let triple;
    const prefix = process.env['VSCODE_SYSROOT_PREFIX'] ?? '-glibc-2.28';
    switch (arch) {
        case 'amd64':
            expectedName = `x86_64-linux-gnu${prefix}.tar.gz`;
            triple = 'x86_64-linux-gnu';
            break;
        case 'arm64':
            expectedName = `aarch64-linux-gnu${prefix}.tar.gz`;
            triple = 'aarch64-linux-gnu';
            break;
        case 'armhf':
            expectedName = `arm-rpi-linux-gnueabihf${prefix}.tar.gz`;
            triple = 'arm-rpi-linux-gnueabihf';
            break;
    }
    console.log(`Fetching ${expectedName} for ${triple}`);
    const checksumSha256 = getVSCodeSysrootChecksum(expectedName);
    if (!checksumSha256) {
        throw new Error(`Could not find checksum for ${expectedName}`);
    }
    const sysroot = process.env['VSCODE_SYSROOT_DIR'] ?? path.join((0, os_1.tmpdir)(), `vscode-${arch}-sysroot`);
    const stamp = path.join(sysroot, '.stamp');
    const result = `${sysroot}/${triple}/${triple}/sysroot`;
    if (fs.existsSync(stamp) && fs.readFileSync(stamp).toString() === expectedName) {
        return result;
    }
    console.log(`Installing ${arch} root image: ${sysroot}`);
    fs.rmSync(sysroot, { recursive: true, force: true });
    fs.mkdirSync(sysroot);
    await fetchUrl({
        checksumSha256,
        assetName: expectedName,
        dest: sysroot
    });
    fs.writeFileSync(stamp, expectedName);
    return result;
}
async function getChromiumSysroot(arch) {
    const sysrootJSONUrl = `https://raw.githubusercontent.com/electron/electron/v${getElectronVersion().electronVersion}/script/sysroots.json`;
    const sysrootDictLocation = `${(0, os_1.tmpdir)()}/sysroots.json`;
    const result = (0, child_process_1.spawnSync)('curl', [sysrootJSONUrl, '-o', sysrootDictLocation]);
    if (result.status !== 0) {
        throw new Error('Cannot retrieve sysroots.json. Stderr:\n' + result.stderr);
    }
    const sysrootInfo = require(sysrootDictLocation);
    const sysrootArch = `bullseye_${arch}`;
    const sysrootDict = sysrootInfo[sysrootArch];
    const tarballFilename = sysrootDict['Tarball'];
    const tarballSha = sysrootDict['Sha1Sum'];
    const sysroot = path.join((0, os_1.tmpdir)(), sysrootDict['SysrootDir']);
    const url = [URL_PREFIX, URL_PATH, tarballSha, tarballFilename].join('/');
    const stamp = path.join(sysroot, '.stamp');
    if (fs.existsSync(stamp) && fs.readFileSync(stamp).toString() === url) {
        return sysroot;
    }
    console.log(`Installing Debian ${arch} root image: ${sysroot}`);
    fs.rmSync(sysroot, { recursive: true, force: true });
    fs.mkdirSync(sysroot);
    const tarball = path.join(sysroot, tarballFilename);
    console.log(`Downloading ${url}`);
    let downloadSuccess = false;
    for (let i = 0; i < 3 && !downloadSuccess; i++) {
        fs.writeFileSync(tarball, '');
        await new Promise((c) => {
            https.get(url, (res) => {
                res.on('data', (chunk) => {
                    fs.appendFileSync(tarball, chunk);
                });
                res.on('end', () => {
                    downloadSuccess = true;
                    c();
                });
            }).on('error', (err) => {
                console.error('Encountered an error during the download attempt: ' + err.message);
                c();
            });
        });
    }
    if (!downloadSuccess) {
        fs.rmSync(tarball);
        throw new Error('Failed to download ' + url);
    }
    const sha = getSha(tarball);
    if (sha !== tarballSha) {
        throw new Error(`Tarball sha1sum is wrong. Expected ${tarballSha}, actual ${sha}`);
    }
    const proc = (0, child_process_1.spawnSync)('tar', ['xf', tarball, '-C', sysroot]);
    if (proc.status) {
        throw new Error('Tarball extraction failed with code ' + proc.status);
    }
    fs.rmSync(tarball);
    fs.writeFileSync(stamp, url);
    return sysroot;
}
//# sourceMappingURL=install-sysroot.js.map