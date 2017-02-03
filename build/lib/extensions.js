/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
var event_stream_1 = require("event-stream");
var assign = require("object-assign");
var remote = require("gulp-remote-src");
var flatmap = require('gulp-flatmap');
var vzip = require('gulp-vinyl-zip');
var filter = require('gulp-filter');
var rename = require('gulp-rename');
var util = require('gulp-util');
var buffer = require('gulp-buffer');
var json = require('gulp-json-editor');
function error(err) {
    var result = event_stream_1.through();
    setTimeout(function () { return result.emit('error', err); });
    return result;
}
var baseHeaders = {
    'X-Market-Client-Id': 'VSCode Build',
    'User-Agent': 'VSCode Build',
};
function src(extensionName, version) {
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
exports.src = src;
