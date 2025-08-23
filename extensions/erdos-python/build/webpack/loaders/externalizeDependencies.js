// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const common = require('../common');

function replaceModule(prefixRegex, prefix, contents, moduleName, quotes) {
    const stringToSearch = `${prefixRegex}${quotes}${moduleName}${quotes}`;
    const stringToReplaceWith = `${prefix}${quotes}./node_modules/${moduleName}${quotes}`;
    return contents.replace(new RegExp(stringToSearch, 'gm'), stringToReplaceWith);
}

// eslint-disable-next-line camelcase
function default_1(source) {
    common.nodeModulesToReplacePaths.forEach((moduleName) => {
        if (source.indexOf(moduleName) > 0) {
            source = replaceModule('import\\(', 'import(', source, moduleName, '"');
            source = replaceModule('import\\(', 'import(', source, moduleName, "'");
            source = replaceModule('require\\(', 'require(', source, moduleName, '"');
            source = replaceModule('require\\(', 'require(', source, moduleName, "'");
            source = replaceModule('from ', 'from ', source, moduleName, '"');
            source = replaceModule('from ', 'from ', source, moduleName, "'");
        }
    });
    return source;
}
// eslint-disable-next-line camelcase
exports.default = default_1;
