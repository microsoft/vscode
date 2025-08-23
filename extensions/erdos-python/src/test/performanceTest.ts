// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

/*
Comparing performance metrics is not easy (the metrics can and always get skewed).
One approach is to run the tests multile times and gather multiple sample data.
For Extension activation times, we load both extensions x times, and re-load the window y times in each x load.
I.e. capture averages by giving the extensions sufficient time to warm up.
This block of code merely launches the tests by using either the dev or release version of the extension,
and spawning the tests (mimic user starting tests from command line), this way we can run tests multiple times.
*/

// Must always be on top to setup expected env.
process.env.VSC_PYTHON_PERF_TEST = '1';

import { spawn } from 'child_process';
import * as download from 'download';
import * as fs from '../client/common/platform/fs-paths';
import * as path from 'path';
import * as bent from 'bent';
import { LanguageServerType } from '../client/activation/types';
import { EXTENSION_ROOT_DIR, PVSC_EXTENSION_ID } from '../client/common/constants';
import { unzip } from './common';
import { initializeLogger } from './testLogger';

initializeLogger();

const NamedRegexp = require('named-js-regexp');
const del = require('del');

const tmpFolder = path.join(EXTENSION_ROOT_DIR, 'tmp');
const publishedExtensionPath = path.join(tmpFolder, 'ext', 'testReleaseExtensionsFolder');
const logFilesPath = path.join(tmpFolder, 'test', 'logs');

enum Version {
    Dev,
    Release,
}

class TestRunner {
    public async start() {
        await del([path.join(tmpFolder, '**')]);
        await this.extractLatestExtension(publishedExtensionPath);

        const timesToLoadEachVersion = 2;
        const devLogFiles: string[] = [];
        const releaseLogFiles: string[] = [];
        const languageServerLogFiles: string[] = [];

        for (let i = 0; i < timesToLoadEachVersion; i += 1) {
            await this.enableLanguageServer();

            const devLogFile = path.join(logFilesPath, `dev_loadtimes${i}.txt`);
            console.log(`Start Performance Tests: Counter ${i}, for Dev version with Jedi`);
            await this.capturePerfTimes(Version.Dev, devLogFile);
            devLogFiles.push(devLogFile);

            const releaseLogFile = path.join(logFilesPath, `release_loadtimes${i}.txt`);
            console.log(`Start Performance Tests: Counter ${i}, for Release version with Jedi`);
            await this.capturePerfTimes(Version.Release, releaseLogFile);
            releaseLogFiles.push(releaseLogFile);
        }

        console.log('Compare Performance Results');
        await this.runPerfTest(devLogFiles, releaseLogFiles, languageServerLogFiles);
    }
    private async enableLanguageServer() {
        const settings = `{ "python.languageServer": "${LanguageServerType.Jedi}" }`;
        await fs.writeFile(path.join(EXTENSION_ROOT_DIR, 'src', 'test', 'performance', 'settings.json'), settings);
    }

    private async capturePerfTimes(version: Version, logFile: string) {
        const releaseVersion = await this.getReleaseVersion();
        const devVersion = await this.getDevVersion();
        await fs.ensureDir(path.dirname(logFile));
        const env: Record<string, {}> = {
            ACTIVATION_TIMES_LOG_FILE_PATH: logFile,
            ACTIVATION_TIMES_EXT_VERSION: version === Version.Release ? releaseVersion : devVersion,
            CODE_EXTENSIONS_PATH: version === Version.Release ? publishedExtensionPath : EXTENSION_ROOT_DIR,
        };

        await this.launchTest(env);
    }
    private async runPerfTest(devLogFiles: string[], releaseLogFiles: string[], languageServerLogFiles: string[]) {
        const env: Record<string, {}> = {
            ACTIVATION_TIMES_DEV_LOG_FILE_PATHS: JSON.stringify(devLogFiles),
            ACTIVATION_TIMES_RELEASE_LOG_FILE_PATHS: JSON.stringify(releaseLogFiles),
            ACTIVATION_TIMES_DEV_LANGUAGE_SERVER_LOG_FILE_PATHS: JSON.stringify(languageServerLogFiles),
        };

        await this.launchTest(env);
    }

    private async launchTest(customEnvVars: Record<string, {}>) {
        await new Promise<void>((resolve, reject) => {
            const env: Record<string, string> = {
                TEST_FILES_SUFFIX: 'perf.test',
                CODE_TESTS_WORKSPACE: path.join(EXTENSION_ROOT_DIR, 'src', 'test', 'performance'),
                ...process.env,
                ...customEnvVars,
            };

            const proc = spawn('node', [path.join(__dirname, 'standardTest.js')], { cwd: EXTENSION_ROOT_DIR, env });
            proc.stdout.pipe(process.stdout);
            proc.stderr.pipe(process.stderr);
            proc.on('error', reject);
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(`Failed with code ${code}.`);
                }
            });
        });
    }

    private async extractLatestExtension(targetDir: string): Promise<void> {
        const extensionFile = await this.downloadExtension();
        await unzip(extensionFile, targetDir);
    }

    private async getReleaseVersion(): Promise<string> {
        const url = `https://marketplace.visualstudio.com/items?itemName=${PVSC_EXTENSION_ID}`;
        const request = bent.default('string', 'GET', 200);

        const content: string = await request(url);
        const re = NamedRegexp('"version"S?:S?"(:<version>\\d{4}\\.\\d{1,2}\\.\\d{1,2})"', 'g');
        const matches = re.exec(content);
        return matches.groups().version;
    }

    private async getDevVersion(): Promise<string> {
        return require(path.join(EXTENSION_ROOT_DIR, 'package.json')).version;
    }

    private async downloadExtension(): Promise<string> {
        const version = await this.getReleaseVersion();
        const url = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/ms-python/vsextensions/python/${version}/vspackage`;
        const destination = path.join(__dirname, `extension${version}.zip`);
        if (await fs.pathExists(destination)) {
            return destination;
        }

        await download.default(url, path.dirname(destination), { filename: path.basename(destination) });
        return destination;
    }
}

new TestRunner().start().catch((ex) => console.error('Error in running Performance Tests', ex));
