/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var snaps;
(function (snaps) {
    var fs = require('fs');
    var path = require('path');
    var os = require('os');
    var cp = require('child_process');
    var mksnapshot = path.join(__dirname, "../../node_modules/.bin/" + (process.platform === 'win32' ? 'mksnapshot.cmd' : 'mksnapshot'));
    var product = require('../../product.json');
    var arch = (process.argv.join('').match(/--arch=(.*)/) || [])[1];
    //
    var loaderFilepath;
    var startupBlobFilepath;
    switch (process.platform) {
        case 'darwin':
            loaderFilepath = "VSCode-darwin/" + product.nameLong + ".app/Contents/Resources/app/out/vs/loader.js";
            startupBlobFilepath = "VSCode-darwin/" + product.nameLong + ".app/Contents/Frameworks/Electron Framework.framework/Resources/snapshot_blob.bin";
            break;
        case 'win32':
        case 'linux':
            loaderFilepath = "VSCode-" + process.platform + "-" + arch + "/resources/app/out/vs/loader.js";
            startupBlobFilepath = "VSCode-" + process.platform + "-" + arch + "/snapshot_blob.bin";
    }
    loaderFilepath = path.join(__dirname, '../../../', loaderFilepath);
    startupBlobFilepath = path.join(__dirname, '../../../', startupBlobFilepath);
    snapshotLoader(loaderFilepath, startupBlobFilepath);
    function snapshotLoader(loaderFilepath, startupBlobFilepath) {
        var inputFile = fs.readFileSync(loaderFilepath);
        var wrappedInputFile = "\n\t\tvar Monaco_Loader_Init;\n\t\t(function() {\n\t\t\tvar doNotInitLoader = true;\n\t\t\t" + inputFile.toString() + ";\n\t\t\tMonaco_Loader_Init = function() {\n\t\t\t\tAMDLoader.init();\n\t\t\t\tCSSLoaderPlugin.init();\n\t\t\t\tNLSLoaderPlugin.init();\n\n\t\t\t\treturn { define, require };\n\t\t\t}\n\t\t})();\n\t\t";
        var wrappedInputFilepath = path.join(os.tmpdir(), 'wrapped-loader.js');
        console.log(wrappedInputFilepath);
        fs.writeFileSync(wrappedInputFilepath, wrappedInputFile);
        cp.execFileSync(mksnapshot, [wrappedInputFilepath, "--startup_blob", startupBlobFilepath]);
    }
})(snaps || (snaps = {}));
