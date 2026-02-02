"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSysroot = void 0;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const os_1 = require("os");
const fs = require("fs");
const https = require("https");
const path = require("path");
const util = require("../../lib/util");
// Based on https://source.chromium.org/chromium/chromium/src/+/main:build/linux/sysroot_scripts/install-sysroot.py.
const URL_PREFIX = 'https://msftelectron.blob.core.windows.net';
const URL_PATH = 'sysroots/toolchain';
function getSha(filename) {
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
async function getSysroot(arch) {
    const sysrootJSONUrl = `https://raw.githubusercontent.com/electron/electron/v${util.getElectronVersion().electronVersion}/script/sysroots.json`;
    const sysrootDictLocation = `${(0, os_1.tmpdir)()}/sysroots.json`;
    const result = (0, child_process_1.spawnSync)('curl', [sysrootJSONUrl, '-o', sysrootDictLocation]);
    if (result.status !== 0) {
        throw new Error('Cannot retrieve sysroots.json. Stderr:\n' + result.stderr);
    }
    const sysrootInfo = require(sysrootDictLocation);
    const sysrootArch = arch === 'armhf' ? 'bullseye_arm' : `bullseye_${arch}`;
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
exports.getSysroot = getSysroot;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFsbC1zeXNyb290LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaW5zdGFsbC1zeXNyb290LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLGlEQUEwQztBQUMxQyxtQ0FBb0M7QUFDcEMsMkJBQTRCO0FBQzVCLHlCQUF5QjtBQUN6QiwrQkFBK0I7QUFDL0IsNkJBQTZCO0FBRTdCLHVDQUF1QztBQUV2QyxvSEFBb0g7QUFDcEgsTUFBTSxVQUFVLEdBQUcsNENBQTRDLENBQUM7QUFDaEUsTUFBTSxRQUFRLEdBQUcsb0JBQW9CLENBQUM7QUFFdEMsU0FBUyxNQUFNLENBQUMsUUFBcUI7SUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBQSxtQkFBVSxFQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2hDLDJCQUEyQjtJQUMzQixNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUN0QyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQztJQUN6QyxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7SUFDakIsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLE9BQU8sQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUssTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQzVGLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEIsUUFBUSxJQUFJLFNBQVMsQ0FBQztJQUN2QixDQUFDO0lBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ3hDLE9BQU8sSUFBSSxDQUFD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