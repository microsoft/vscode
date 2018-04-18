/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var nsfw = require('nsfw');
var path = require('path');
var fs = require('fs');
var File = require('vinyl');
var es = require('event-stream');
var filter = require('gulp-filter');

function toChangeType(type) {
    switch (type) {
        case 0: return 'add';
        case 1: return 'unlink';
        case 2: return 'change';
    }
}

function watch(root) {
    var result = es.through();

    function handleEvent(path, type) {
        if (/[/\\].git[/\\]/.test(path) || /[/\\]out[/\\]/.test(path)) {
            return; // filter as early as possible
        }

        var file = new File({
            path: path,
            base: root
        });
        //@ts-ignore
        file.event = type;
        result.emit('data', file);
    }

    nsfw(root, function (events) {
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            var changeType = e.action;

            if (changeType === 3 /* RENAMED */) {
                handleEvent(path.join(e.directory, e.oldFile), 'unlink');
                handleEvent(path.join(e.directory, e.newFile), 'add');
            } else {
                handleEvent(path.join(e.directory, e.file), toChangeType(changeType));
            }
        }
    }).then(function (watcher) {
        watcher.start();
    });

    return result;
}

var cache = Object.create(null);

module.exports = function (pattern, options) {
    options = options || {};

    var cwd = path.normalize(options.cwd || process.cwd());
    var watcher = cache[cwd];

    if (!watcher) {
        watcher = cache[cwd] = watch(cwd);
    }

    var rebase = !options.base ? es.through() : es.mapSync(function (f) {
        f.base = options.base;
        return f;
    });

    return watcher
        .pipe(filter(['**', '!.git{,/**}'])) // ignore all things git
        .pipe(filter(pattern))
        .pipe(es.map(function (file, cb) {
            fs.stat(file.path, function (err, stat) {
                if (err && err.code === 'ENOENT') { return cb(null, file); }
                if (err) { return cb(); }
                if (!stat.isFile()) { return cb(); }

                fs.readFile(file.path, function (err, contents) {
                    if (err && err.code === 'ENOENT') { return cb(null, file); }
                    if (err) { return cb(); }

                    file.contents = contents;
                    file.stat = stat;
                    cb(null, file);
                });
            });
        }))
        .pipe(rebase);
};