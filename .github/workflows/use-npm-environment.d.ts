import type { PackageManifest } from "../read-manifest.js";
import type { NormalizedOptions } from "../normalize-options.js";
export type NpmCliEnvironment = Record<string, string>;
export type NpmCliTask<TReturn> = (manifest: PackageManifest, options: NormalizedOptions, environment: NpmCliEnvironment) => Promise<TReturn>;
/**
 * Create a temporary .npmrc file with the given auth token, and call a task
 * with env vars set to use that .npmrc.
 *
 * @param manifest Pacakge metadata.
 * @param options Configuration options.
 * @param task A function called with the configured environment. After the
 *   function resolves, the temporary .npmrc file will be removed.
 * @returns The resolved value of `task`
 */
export declare function useNpmEnvironment<TReturn>(manifest: PackageManifest, options: NormalizedOptions, task: NpmCliTask<TReturn>): Promise<TReturn>;
