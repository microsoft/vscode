// Type definitions for gulp-filter v3.0.1
// Project: https://github.com/sindresorhus/gulp-filter
// Definitions by: Tanguy Krotoff <https://github.com/tkrotoff>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module 'gulp-filter' {
  import File = require('vinyl');
  import * as Minimatch from 'minimatch';

  namespace filter {
    interface FileFunction {
      (file: File): boolean;
    }

    interface Options extends Minimatch.IOptions {
      restore?: boolean;
      passthrough?: boolean;
    }

    // A transform stream with a .restore object
    interface Filter extends NodeJS.ReadWriteStream {
      restore: NodeJS.ReadWriteStream
    }
  }

  function filter(pattern: string | string[] | filter.FileFunction, options?: filter.Options): filter.Filter;

  export = filter;
}