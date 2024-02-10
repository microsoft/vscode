import type { Access, Strategy } from "./options.js";
import type { ReleaseType as SemverReleaseType } from "semver";
/** Release type */
export type ReleaseType = SemverReleaseType | typeof INITIAL | typeof DIFFERENT;
export declare const INITIAL = "initial";
export declare const DIFFERENT = "different";
/** Results of the publish */
export interface Results {
    /**
     * The identifier of the published package, if published. Format is
     * `${packageName}@${version}`
     */
    id: string | undefined;
    /** The name of the NPM package that was published */
    name: string;
    /** The version that was published */
    version: string;
    /** The type of version change that occurred, if any. */
    type: ReleaseType | undefined;
    /** The version number that was previously published to NPM, if any. */
    oldVersion: string | undefined;
    /** The registry where the package was published */
    registry: URL;
    /** The tag that the package was published to. */
    tag: string;
    /**
     * Indicates whether the published package is publicly visible or restricted
     * to members of your NPM organization.
     *
     * If package is scoped, undefined means npm's scoped package defaults. If a
     * scoped package has previously been published as public, the default is
     * public. Otherwise, it is restricted.
     */
    access: Access | undefined;
    /** Version check strategy used. */
    strategy: Strategy;
    /** Whether this was a dry run (not published to NPM) */
    dryRun: boolean;
}
