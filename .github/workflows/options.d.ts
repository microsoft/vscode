/** The possible access levels for an NPM package */
export type Access = typeof ACCESS_PUBLIC | typeof ACCESS_RESTRICTED;
export declare const ACCESS_PUBLIC = "public";
export declare const ACCESS_RESTRICTED = "restricted";
/**
 * Version check strategy.
 *
 * - `upgrade`: the package will only be published if its version is higher than
 *   the existing version on the configured tag.
 * - `all`: the package will be published if its version is not yet published,
 *   even if its lower that the existing tag.
 */
export type Strategy = typeof STRATEGY_UPGRADE | typeof STRATEGY_ALL;
export declare const STRATEGY_UPGRADE = "upgrade";
export declare const STRATEGY_ALL = "all";
/** An interface that can be used to log messages. */
export interface Logger {
    error: (message: string | Error) => void;
    info?: undefined | ((message: string) => void);
    debug?: undefined | ((message: string) => void);
}
/** Options that determine how/whether the package is published. */
export interface Options {
    /** The NPM access token to use when publishing. */
    token: string;
    /**
     * The absolute or relative path of your package.
     *
     * Defaults to the package in the current working directory.
     */
    package?: string | undefined;
    /**
     * The NPM registry URL to use.
     *
     * Defaults to "https://registry.npmjs.org/".
     *
     * Can be set by the package.json's `publishConfig` field.
     */
    registry?: string | URL | undefined;
    /**
     * The tag to publish to.
     *
     * Defaults to "latest".
     *
     * Can be set by the package.json's `publishConfig` field.
     */
    tag?: string | undefined;
    /**
     * Package access.
     *
     * Determines whether the published package should be publicly visible, or
     * restricted to members of your NPM organization. This only applies to scoped
     * packages.
     *
     * Defaults to "restricted" for scoped packages, unless that package has been
     * previously published as `public`.
     *
     * Can be set by the package.json's `publishConfig` field.
     */
    access?: Access | undefined;
    /**
     * Generate provenance statements.
     *
     * Publish must be run from a supported CI provider to succeed. When run from
     * GitHub Actions, requires `id-token: write` permission.
     *
     * Defaults to `false`.
     *
     * Can be set by the package.json's `publishConfig` field.
     */
    provenance?: boolean | undefined;
    /**
     * Version check strategy.
     *
     * - `always` (default): the package will be published if its version is simply
     *   not yet published.
     * - `upgrade`: the package will only be published if its version is higher than
     *   the existing version on the configured tag.
     */
    strategy?: Strategy | undefined;
    /**
     * Ignore lifecycle scripts.
     *
     * If `true` (default), `--ignore-scripts` will be passed to `npm`. If you
     * rely on publish lifecycle scripts - i.e. `prepublishOnly`, `prepack`,
     * `prepare`, `postpack`, `publish`, `postpublish` - you should set this to
     * `false` or rework your build and publish workflow.
     */
    ignoreScripts?: boolean | undefined;
    /**
     * Pretend to publish, but don't actually upload to the registry.
     *
     * Defaults to `false`.
     */
    dryRun?: boolean | undefined;
    /** Optional logger. */
    logger?: Logger | undefined;
    /**
     * Temporary directory.
     *
     * Defaults to os.tmpdir()
     */
    temporaryDirectory?: string | undefined;
}
