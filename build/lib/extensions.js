"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
var es = require("event-stream");
var assign = require("object-assign");
var remote = require("gulp-remote-src");
var flatmap = require('gulp-flatmap');
var vzip = require('gulp-vinyl-zip');
var filter = require('gulp-filter');
var rename = require('gulp-rename');
var util = require('gulp-util');
var buffer = require('gulp-buffer');
var json = require('gulp-json-editor');
var webpack = require('webpack');
var webpackGulp = require('webpack-stream');
var fs = require("fs");
var path = require("path");
var vsce = require("vsce");
var File = require("vinyl");
function fromLocal(extensionPath, sourceMappingURLBase) {
    var result = es.through();
    vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.Yarn }).then(function (fileNames) {
        var files = fileNames
            .map(function (fileName) { return path.join(extensionPath, fileName); })
            .map(function (filePath) { return new File({
            path: filePath,
            stat: fs.statSync(filePath),
            base: extensionPath,
            contents: fs.createReadStream(filePath)
        }); });
        var filesStream = es.readArray(files);
        // check for a webpack configuration file, then invoke webpack
        // and merge its output with the files stream. also rewrite the package.json
        // file to a new entry point
        if (fs.existsSync(path.join(extensionPath, 'extension.webpack.config.js'))) {
            console.log("Using Webpack for \"" + extensionPath + "\"");
            var packageJsonFilter = filter('package.json', { restore: true });
            var patchFilesStream = filesStream
                .pipe(packageJsonFilter)
                .pipe(buffer())
                .pipe(json(function (data) {
                // hardcoded entry point directory!
                data.main = data.main.replace('/out/', /dist/);
                return data;
            }))
                .pipe(packageJsonFilter.restore);
            var webpackConfig = require(path.join(extensionPath, 'extension.webpack.config.js'));
            var webpackStream = webpackGulp(webpackConfig, webpack)
                .pipe(es.through(function (data) {
                data.stat = data.stat || {};
                data.base = extensionPath;
                this.emit('data', data);
            }))
                .pipe(es.through(function (data) {
                // source map handling:
                // * rewrite sourceMappingURL
                // * save to disk so that upload-task picks this up
                if (sourceMappingURLBase) {
                    var contents = data.contents.toString('utf8');
                    data.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, function (_m, g1) {
                        return "\n//# sourceMappingURL=" + sourceMappingURLBase + "/extensions/" + path.basename(extensionPath) + "/dist/" + g1;
                    }), 'utf8');
                    if (/\.js\.map$/.test(data.path)) {
                        if (!fs.existsSync(path.dirname(data.path))) {
                            fs.mkdirSync(path.dirname(data.path));
                        }
                        fs.writeFileSync(data.path, data.contents);
                        console.log("Webpack source maps saved as \"" + data.path + "\"");
                    }
                }
                this.emit('data', data);
            }));
            es.merge(webpackStream, patchFilesStream)
                // .pipe(es.through(function (data) {
                // 	// debug
                // 	console.log('out', data.path, data.contents.length);
                // 	this.emit('data', data);
                // }))
                .pipe(result);
        }
        else {
            filesStream.pipe(result);
        }
    }).catch(function (err) { return result.emit('error', err); });
    return result;
}
exports.fromLocal = fromLocal;
function error(err) {
    var result = es.through();
    setTimeout(function () { return result.emit('error', err); });
    return result;
}
var baseHeaders = {
    'X-Market-Client-Id': 'VSCode Build',
    'User-Agent': 'VSCode Build',
    'X-Market-User-Id': '291C1CD0-051A-4123-9B4B-30D60EF52EE2',
};
function fromMarketplace(extensionName, version) {
    var filterType = 7;
    var value = extensionName;
    var criterium = { filterType: filterType, value: value };
    var criteria = [criterium];
    var pageNumber = 1;
    var pageSize = 1;
    var sortBy = 0;
    var sortOrder = 0;
    var flags = 0x1 | 0x2 | 0x80;
    var assetTypes = ['Microsoft.VisualStudio.Services.VSIXPackage'];
    var filters = [{ criteria: criteria, pageNumber: pageNumber, pageSize: pageSize, sortBy: sortBy, sortOrder: sortOrder }];
    var body = JSON.stringify({ filters: filters, assetTypes: assetTypes, flags: flags });
    var headers = assign({}, baseHeaders, {
        'Content-Type': 'application/json',
        'Accept': 'application/json;api-version=3.0-preview.1',
        'Content-Length': body.length
    });
    var options = {
        base: 'https://marketplace.visualstudio.com/_apis/public/gallery',
        requestOptions: {
            method: 'POST',
            gzip: true,
            headers: headers,
            body: body
        }
    };
    return remote('/extensionquery', options)
        .pipe(flatmap(function (stream, f) {
        var rawResult = f.contents.toString('utf8');
        var result = JSON.parse(rawResult);
        var extension = result.results[0].extensions[0];
        if (!extension) {
            return error("No such extension: " + extension);
        }
        var metadata = {
            id: extension.extensionId,
            publisherId: extension.publisher,
            publisherDisplayName: extension.publisher.displayName
        };
        var extensionVersion = extension.versions.filter(function (v) { return v.version === version; })[0];
        if (!extensionVersion) {
            return error("No such extension version: " + extensionName + " @ " + version);
        }
        var asset = extensionVersion.files.filter(function (f) { return f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage'; })[0];
        if (!asset) {
            return error("No VSIX found for extension version: " + extensionName + " @ " + version);
        }
        util.log('Downloading extension:', util.colors.yellow(extensionName + "@" + version), '...');
        var options = {
            base: asset.source,
            requestOptions: {
                gzip: true,
                headers: baseHeaders
            }
        };
        return remote('', options)
            .pipe(flatmap(function (stream) {
            var packageJsonFilter = filter('package.json', { restore: true });
            return stream
                .pipe(vzip.src())
                .pipe(filter('extension/**'))
                .pipe(rename(function (p) { return p.dirname = p.dirname.replace(/^extension\/?/, ''); }))
                .pipe(packageJsonFilter)
                .pipe(buffer())
                .pipe(json({ __metadata: metadata }))
                .pipe(packageJsonFilter.restore);
        }));
    }));
}
exports.fromMarketplace = fromMarketplace;
