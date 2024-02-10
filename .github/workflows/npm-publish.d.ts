import type { Options } from "./options.js";
import type { Results } from "./results.js";
/**
 * Publishes a package to NPM, if its version has changed.
 *
 * @param options Publish options.
 * @returns Release metadata.
 */
export declare function npmPublish(options: Options): Promise<Results>;
