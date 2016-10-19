
var fs = require('fs');
var cp = require('child_process');
var path = require('path');

var keep = [
	'azure-storage',
	'clone',
	'debounce',
	'event-stream',
	'glob',
	'gulp-azure-storage',
	'gulp-bom',
	'gulp-buffer',
	'gulp-concat',
	'gulp-cssnano',
	'gulp-filter',
	'gulp-flatmap',
	'gulp-json-editor',
	'gulp-mocha',
	'gulp-remote-src',
	'gulp-rename',
	'gulp-sourcemaps',
	'gulp-tsb',
	'gulp-uglify',
	'gulp-util',
	'gulp-vinyl-zip',
	'gulp-watch',
	'gulp',
	'lazy.js',
	'object-assign',
	'pump',
	'rimraf',
	'source-map',
	'typescript',
	'underscore',
	'vinyl',
	'vscode-nls-dev',
];

var packageJSON = require('../package.json');
var modules = keep.map(function(module) {
	var version = packageJSON.devDependencies[module];
	if (version) {
		return module + '@' + version.replace(/^\^/, '');
	} else {
		return module;
	}
});

var cmd = `npm install ${modules.join(' ')}`;
console.log(cmd);
cp.execSync(cmd, {
	cwd: path.join(__dirname, '..')
});
