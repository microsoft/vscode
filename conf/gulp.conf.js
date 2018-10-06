'use strict';

/**
 *  This file contains the variables used in other gulp files
 *  which defines tasks
 *  By design, we only put there very generic config values
 *  which are used in several places to keep good readability
 *  of the tasks
 */

const path = require('path');
const gutil = require('gulp-util');

/**
 *  The main paths of your project handle these with care
 */
exports.paths = {
  src: 'src',
  dist: 'dist',
  tmp: '.tmp',
  e2e: 'e2e',
  tasks: 'gulp_tasks'
};

/**
* used on gulp dist
*/
exports.htmlmin = {
  ignoreCustomFragments: [/{{.*?}}/]
};

exports.path = {};
for (const pathName in exports.paths) {
  if (Object.prototype.hasOwnProperty.call(exports.paths, pathName)) {
    exports.path[pathName] = function () {
      const pathValue = exports.paths[pathName];
      const funcArgs = Array.prototype.slice.call(arguments);
      const joinArgs = [pathValue].concat(funcArgs);
      return path.join.apply(this, joinArgs);
    };
  }
}

/**
 *  Common implementation for an error handler of a Gulp plugin
 */
exports.errorHandler = function (title) {
  return function (err) {
    gutil.log(gutil.colors.red(`[${title}]`), err.toString());
    this.emit('end');
  };
};
