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
    const sysrootJSONUrl = `https://raw.githubusercontent.com/electron/electron/v${util.getElectronVersion()}/script/sysroots.json`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFsbC1zeXNyb290LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaW5zdGFsbC1zeXNyb290LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLGlEQUEwQztBQUMxQyxtQ0FBb0M7QUFDcEMsMkJBQTRCO0FBQzVCLHlCQUF5QjtBQUN6QiwrQkFBK0I7QUFDL0IsNkJBQTZCO0FBRTdCLHVDQUF1QztBQUV2QyxvSEFBb0g7QUFDcEgsTUFBTSxVQUFVLEdBQUcsNENBQTRDLENBQUM7QUFDaEUsTUFBTSxRQUFRLEdBQUcsb0JBQW9CLENBQUM7QUFFdEMsU0FBUyxNQUFNLENBQUMsUUFBcUI7SUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBQSxtQkFBVSxFQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2hDLDJCQUEyQjtJQUMzQixNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUN0QyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQztJQUN6QyxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7SUFDakIsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLE9BQU8sQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUssTUFBTSxDQUFDLE1BQU0sRUFBRTtRQUMzRixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BCLFFBQVEsSUFBSSxTQUFTLENBQUM7S0FDdEI7SUFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDeEMsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFD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