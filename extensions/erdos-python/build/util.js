// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const fs = require('fs');
const path = require('path');

exports.ExtensionRootDir = path.dirname(__dirname);
function getListOfFiles(filename) {
    filename = path.normalize(filename);
    if (!path.isAbsolute(filename)) {
        filename = path.join(__dirname, filename);
    }
    const data = fs.readFileSync(filename).toString();
    const files = JSON.parse(data);
    return files.map((file) => path.join(exports.ExtensionRootDir, file.replace(/\//g, path.sep)));
}
exports.getListOfFiles = getListOfFiles;
