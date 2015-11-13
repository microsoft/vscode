var gulp = require('gulp');
var decompress = require('gulp-decompress');
var download = require('gulp-download');
var del = require('del');
var fs = require('fs');
var join = require('path').join;


gulp.task('omnisharp:clean', function () {
	return del('bin');
});

gulp.task('omnisharp:fetch', ['omnisharp:clean'], function () {

	var release = 'https://github.com/OmniSharp/omnisharp-roslyn/releases/download/v1.5.6/omnisharp.tar.gz';

	return download(release)
		.pipe(decompress({strip: 1}))
		.pipe(gulp.dest('bin'))
});

gulp.task('omnisharp:fixscripts', ['omnisharp:fetch'], function () {

	var _fixes = Object.create(null);
	_fixes['./bin/omnisharp.cmd'] = '@"%~dp0packages\\dnx-clr-win-x86.1.0.0-beta4\\bin\\dnx.exe" "%~dp0packages\\OmniSharp\\1.0.0\\root" run %*';
	_fixes['./bin/omnisharp'] = '#!/bin/bash\n\
SOURCE="${BASH_SOURCE[0]}"\n\
while [ -h "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink\n\
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"\n\
  SOURCE="$(readlink "$SOURCE")"\n\
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE" # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located\n\
done\n\
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"\n\
export SET DNX_APPBASE="$DIR/packages/OmniSharp/1.0.0/root"\n\
export PATH=/usr/local/bin:/Library/Frameworks/Mono.framework/Commands:$PATH # this is required for the users of the Homebrew Mono package\n\
exec "$DIR/packages/dnx-mono.1.0.0-beta4/bin/dnx" "$DNX_APPBASE" run "$@"\n\
\n';

	var promises = Object.keys(_fixes).map(function (key) {
		return new Promise(function(resolve, reject) {
			fs.writeFile(join(__dirname, key), _fixes[key], function (err) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			})
		});
	});

	return Promise.all(promises)
});


gulp.task('omnisharp', ['omnisharp:fixscripts']);