// Type definitions for gulp-uglify
// Project: https://github.com/terinjokes/gulp-uglify
// Definitions by: Christopher Haws <https://github.com/ChristopherHaws/>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module "gulp-uglify" {
    import * as UglifyJS from 'uglify-js';

    namespace GulpUglify {
        interface Options {
            /**
             * Pass false to skip mangling names.
             */
            mangle?: boolean;

            /**
             * Pass if you wish to specify additional output options. The defaults are optimized for best compression.
             */
            output?: UglifyJS.BeautifierOptions;

            /**
             * Pass an object to specify custom compressor options. Pass false to skip compression completely.
             */
            compress?: UglifyJS.CompressorOptions | boolean;

            /**
             * A convenience option for options.output.comments. Defaults to preserving no comments.
             * all - Preserve all comments in code blocks
             * some - Preserve comments that start with a bang (!) or include a Closure Compiler directive (@preserve, @license, @cc_on)
             * function - Specify your own comment preservation function. You will be passed the current node and the current comment and are expected to return either true or false.
             */
            preserveComments?: string | ((node: any, comment: UglifyJS.Tokenizer) => boolean);

            warnings?: boolean;
        }

        class GulpUglifyError {
            cause: {
                filename: string;
            };
        }
    }

    function GulpUglify(options?: GulpUglify.Options): NodeJS.ReadWriteStream;

    export = GulpUglify;
}