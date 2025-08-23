// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { ApplicationEnvironment } from '../client/common/application/applicationEnvironment';
import { IApplicationEnvironment } from '../client/common/application/types';
import { EXTENSION_ROOT_DIR } from '../client/common/constants';

suite('Extension version tests', () => {
    let version: string;
    let applicationEnvironment: IApplicationEnvironment;
    const branchName = process.env.CI_BRANCH_NAME;

    suiteSetup(async function () {
        // Skip the entire suite if running locally
        if (!branchName) {
            return this.skip();
        }
    });

    setup(() => {
        applicationEnvironment = new ApplicationEnvironment(undefined as any, undefined as any, undefined as any);
        version = applicationEnvironment.packageJson.version;
    });

    test('If we are running a pipeline in the main branch, the extension version in `package.json` should have the "-dev" suffix', async function () {
        if (branchName !== 'main') {
            return this.skip();
        }

        return expect(
            version.endsWith('-dev'),
            'When running a pipeline in the main branch, the extension version in package.json should have the -dev suffix',
        ).to.be.true;
    });

    test('If we are running a pipeline in the release branch, the extension version in `package.json` should not have the "-dev" suffix', async function () {
        if (!branchName!.startsWith('release')) {
            return this.skip();
        }

        return expect(
            version.endsWith('-dev'),
            'When running a pipeline in the release branch, the extension version in package.json should not have the -dev suffix',
        ).to.be.false;
    });
});

suite('Extension localization files', () => {
    test('Load localization file', () => {
        const filesFailed: string[] = [];
        glob.sync('package.nls.*.json', { sync: true, cwd: EXTENSION_ROOT_DIR }).forEach((localizationFile) => {
            try {
                JSON.parse(fs.readFileSync(path.join(EXTENSION_ROOT_DIR, localizationFile)).toString());
            } catch {
                filesFailed.push(localizationFile);
            }
        });

        expect(filesFailed).to.be.lengthOf(0, `Failed to load JSON for ${filesFailed.join(', ')}`);
    });
});
