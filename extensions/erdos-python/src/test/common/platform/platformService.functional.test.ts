// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as os from 'os';
import { parse } from 'semver';
import { PlatformService } from '../../../client/common/platform/platformService';
import { OSType } from '../../../client/common/utils/platform';

use(chaiAsPromised.default);

suite('PlatformService', () => {
    const osType = getOSType();
    test('pathVariableName', async () => {
        const expected = osType === OSType.Windows ? 'Path' : 'PATH';
        const svc = new PlatformService();
        const result = svc.pathVariableName;

        expect(result).to.be.equal(expected, 'invalid value');
    });

    test('virtualEnvBinName - Windows', async () => {
        const expected = osType === OSType.Windows ? 'Scripts' : 'bin';
        const svc = new PlatformService();
        const result = svc.virtualEnvBinName;

        expect(result).to.be.equal(expected, 'invalid value');
    });

    test('isWindows', async () => {
        const expected = osType === OSType.Windows;
        const svc = new PlatformService();
        const result = svc.isWindows;

        expect(result).to.be.equal(expected, 'invalid value');
    });

    test('isMac', async () => {
        const expected = osType === OSType.OSX;
        const svc = new PlatformService();
        const result = svc.isMac;

        expect(result).to.be.equal(expected, 'invalid value');
    });

    test('isLinux', async () => {
        const expected = osType === OSType.Linux;
        const svc = new PlatformService();
        const result = svc.isLinux;

        expect(result).to.be.equal(expected, 'invalid value');
    });

    test('osRelease', async () => {
        const expected = os.release();
        const svc = new PlatformService();
        const result = svc.osRelease;

        expect(result).to.be.equal(expected, 'invalid value');
    });

    test('is64bit', async () => {
        // eslint-disable-next-line global-require
        const arch = require('arch');

        const hostReports64Bit = arch() === 'x64';
        const svc = new PlatformService();
        const result = svc.is64bit;

        expect(result).to.be.equal(
            hostReports64Bit,
            `arch() reports '${arch()}', PlatformService.is64bit reports ${result}.`,
        );
    });

    test('getVersion on Mac/Windows', async function () {
        if (osType === OSType.Linux) {
            return this.skip();
        }
        const expectedVersion = parse(os.release())!;
        const svc = new PlatformService();
        const result = await svc.getVersion();

        expect(result.compare(expectedVersion)).to.be.equal(0, 'invalid value');

        return undefined;
    });
    test('getVersion on Linux shoud throw an exception', async function () {
        if (osType !== OSType.Linux) {
            return this.skip();
        }
        const svc = new PlatformService();

        await expect(svc.getVersion()).to.eventually.be.rejectedWith('Not Supported');

        return undefined;
    });
});

function getOSType(platform: string = process.platform): OSType {
    if (/^win/.test(platform)) {
        return OSType.Windows;
    }
    if (/^darwin/.test(platform)) {
        return OSType.OSX;
    }
    if (/^linux/.test(platform)) {
        return OSType.Linux;
    }
    return OSType.Unknown;
}
