// Type definitions for Gulp v3.8.x
// Project: http://gulpjs.com
// Definitions by: Drew Noakes <https://drewnoakes.com>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module "gulp" {
    import Orchestrator = require("orchestrator");
    import VinylFile = require("vinyl");

    namespace gulp {
        interface Gulp extends Orchestrator {
            /**
             * Define a task
             * @param name The name of the task.
             * @param deps An array of task names to be executed and completed before your task will run.
             * @param fn The function that performs the task's operations. For asynchronous tasks, you need to provide a hint when the task is complete:
             * <ul>
             *     <li>Take in a callback</li>
             *     <li>Return a stream or a promise</li>
             * </ul>
             */
            task: Orchestrator.AddMethod;
            /**
             * Emits files matching provided glob or an array of globs. Returns a stream of Vinyl files that can be piped to plugins.
             * @param glob Glob or array of globs to read.
             * @param opt Options to pass to node-glob through glob-stream.
             */
            src: SrcMethod;
            /**
             * Can be piped to and it will write files. Re-emits all data passed to it so you can pipe to multiple folders.
             * Folders that don't exist will be created.
             *
             * @param outFolder The path (output folder) to write files to. Or a function that returns it, the function will be provided a vinyl File instance.
             * @param opt
             */
            dest: DestMethod;
            /**
             * Watch files and do something when a file changes. This always returns an EventEmitter that emits change events.
             *
             * @param glob a single glob or array of globs that indicate which files to watch for changes.
             * @param opt options, that are passed to the gaze library.
             * @param fn a callback or array of callbacks to be called on each change, or names of task(s) to run when a file changes, added with task().
             */
            watch: WatchMethod;
        }

        interface GulpPlugin {
            (...args: any[]): NodeJS.ReadWriteStream;
        }

        interface WatchMethod {
            /**
             * Watch files and do something when a file changes. This always returns an EventEmitter that emits change events.
             *
             * @param glob a single glob or array of globs that indicate which files to watch for changes.
             * @param fn a callback or array of callbacks to be called on each change, or names of task(s) to run when a file changes, added with task().
             */
            (glob: string|string[], fn: (WatchCallback|string)): NodeJS.EventEmitter;
            /**
             * Watch files and do something when a file changes. This always returns an EventEmitter that emits change events.
             *
             * @param glob a single glob or array of globs that indicate which files to watch for changes.
             * @param fn a callback or array of callbacks to be called on each change, or names of task(s) to run when a file changes, added with task().
             */
            (glob: string|string[], fn: (WatchCallback|string)[]): NodeJS.EventEmitter;
            /**
             * Watch files and do something when a file changes. This always returns an EventEmitter that emits change events.
             *
             * @param glob a single glob or array of globs that indicate which files to watch for changes.
             * @param opt options, that are passed to the gaze library.
             * @param fn a callback or array of callbacks to be called on each change, or names of task(s) to run when a file changes, added with task().
             */
            (glob: string|string[], opt: WatchOptions, fn: (WatchCallback|string)): NodeJS.EventEmitter;
            /**
             * Watch files and do something when a file changes. This always returns an EventEmitter that emits change events.
             *
             * @param glob a single glob or array of globs that indicate which files to watch for changes.
             * @param opt options, that are passed to the gaze library.
             * @param fn a callback or array of callbacks to be called on each change, or names of task(s) to run when a file changes, added with task().
             */
            (glob: string|string[], opt: WatchOptions, fn: (WatchCallback|string)[]): NodeJS.EventEmitter;

        }

        interface DestMethod {
            /**
             * Can be piped to and it will write files. Re-emits all data passed to it so you can pipe to multiple folders.
             * Folders that don't exist will be created.
             *
             * @param outFolder The path (output folder) to write files to. Or a function that returns it, the function will be provided a vinyl File instance.
             * @param opt
             */
            (outFolder: string|((file: VinylFile) => string), opt?: DestOptions): NodeJS.ReadWriteStream;
        }

        interface SrcMethod {
            /**
             * Emits files matching provided glob or an array of globs. Returns a stream of Vinyl files that can be piped to plugins.
             * @param glob Glob or array of globs to read.
             * @param opt Options to pass to node-glob through glob-stream.
             */
            (glob: string|string[], opt?: SrcOptions): NodeJS.ReadWriteStream;
        }

        /**
         * Options to pass to node-glob through glob-stream.
         * Specifies two options in addition to those used by node-glob:
         * https://github.com/isaacs/node-glob#options
         */
        interface SrcOptions {
            /**
             * Setting this to <code>false</code> will return <code>file.contents</code> as <code>null</code>
             * and not read the file at all.
             * Default: <code>true</code>.
             */
            read?: boolean;

            /**
             * Setting this to false will return <code>file.contents</code> as a stream and not buffer files.
             * This is useful when working with large files.
             * Note: Plugins might not implement support for streams.
             * Default: <code>true</code>.
             */
            buffer?: boolean;

            /**
             * The base path of a glob.
             *
             * Default is everything before a glob starts.
             */
            base?: string;

            /**
             * The current working directory in which to search.
             * Defaults to process.cwd().
             */
            cwd?: string;

            /**
             * The place where patterns starting with / will be mounted onto.
             * Defaults to path.resolve(options.cwd, "/") (/ on Unix systems, and C:\ or some such on Windows.)
             */
            root?: string;

            /**
             * Include .dot files in normal matches and globstar matches.
             * Note that an explicit dot in a portion of the pattern will always match dot files.
             */
            dot?: boolean;

            /**
             * Set to match only fles, not directories. Set this flag to prevent copying empty directories
             */
            nodir?: boolean;

            /**
             * By default, a pattern starting with a forward-slash will be "mounted" onto the root setting, so that a valid
             * filesystem path is returned. Set this flag to disable that behavior.
             */
            nomount?: boolean;

            /**
             * Add a / character to directory matches. Note that this requires additional stat calls.
             */
            mark?: boolean;

            /**
             * Don't sort the results.
             */
            nosort?: boolean;

            /**
             * Set to true to stat all results. This reduces performance somewhat, and is completely unnecessary, unless
             * readdir is presumed to be an untrustworthy indicator of file existence. It will cause ELOOP to be triggered one
             * level sooner in the case of cyclical symbolic links.
             */
            stat?: boolean;

            /**
             * When an unusual error is encountered when attempting to read a directory, a warning will be printed to stderr.
             * Set the silent option to true to suppress these warnings.
             */
            silent?: boolean;

            /**
             * When an unusual error is encountered when attempting to read a directory, the process will just continue on in
             * search of other matches. Set the strict option to raise an error in these cases.
             */
            strict?: boolean;

            /**
             * See cache property above. Pass in a previously generated cache object to save some fs calls.
             */
            cache?: boolean;

            /**
             * A cache of results of filesystem information, to prevent unnecessary stat calls.
             * While it should not normally be necessary to set this, you may pass the statCache from one glob() call to the
             * options object of another, if you know that the filesystem will not change between calls.
             */
            statCache?: boolean;

            /**
             * Perform a synchronous glob search.
             */
            sync?: boolean;

            /**
             * In some cases, brace-expanded patterns can result in the same file showing up multiple times in the result set.
             * By default, this implementation prevents duplicates in the result set. Set this flag to disable that behavior.
             */
            nounique?: boolean;

            /**
             * Set to never return an empty set, instead returning a set containing the pattern itself.
             * This is the default in glob(3).
             */
            nonull?: boolean;

            /**
             * Perform a case-insensitive match. Note that case-insensitive filesystems will sometimes result in glob returning
             * results that are case-insensitively matched anyway, since readdir and stat will not raise an error.
             */
            nocase?: boolean;

            /**
             * Set to enable debug logging in minimatch and glob.
             */
            debug?: boolean;

            /**
             * Set to enable debug logging in glob, but not minimatch.
             */
            globDebug?: boolean;
        }

        interface DestOptions {
            /**
             * The output folder. Only has an effect if provided output folder is relative.
             * Default: process.cwd()
             */
            cwd?: string;

            /**
             * Octal permission string specifying mode for any folders that need to be created for output folder.
             * Default: 0777.
             */
            mode?: string;
        }

        /**
         * Options that are passed to <code>gaze</code>.
         * https://github.com/shama/gaze
         */
        interface WatchOptions {
            /** Interval to pass to fs.watchFile. */
            interval?: number;
            /** Delay for events called in succession for the same file/event. */
            debounceDelay?: number;
            /** Force the watch mode. Either 'auto' (default), 'watch' (force native events), or 'poll' (force stat polling). */
            mode?: string;
            /** The current working directory to base file patterns from. Default is process.cwd().. */
            cwd?: string;
        }

        interface WatchEvent {
            /** The type of change that occurred, either added, changed or deleted. */
            type: string;
            /** The path to the file that triggered the event. */
            path: string;
        }

        /**
         * Callback to be called on each watched file change.
         */
        interface WatchCallback {
            (event: WatchEvent): void;
        }

        interface TaskCallback {
            /**
             * Defines a task.
             * Tasks may be made asynchronous if they are passing a callback or return a promise or a stream.
             * @param cb callback used to signal asynchronous completion. Caller includes <code>err</code> in case of error.
             */
            (cb?: (err?: any) => void): any;
        }
    }

    var gulp: gulp.Gulp;

    export = gulp;
}