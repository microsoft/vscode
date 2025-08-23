// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// eslint-disable-next-line max-classes-per-file
import { Uri } from 'vscode';
import { IDisposable } from '../../../common/types';
import { iterEmpty } from '../../../common/utils/async';
import { getURIFilter } from '../../../common/utils/misc';
import { Disposables } from '../../../common/utils/resourceLifecycle';
import { PythonEnvInfo } from '../info';
import { BasicEnvInfo, ILocator, IPythonEnvsIterator, PythonLocatorQuery } from '../locator';
import { combineIterators, Locators } from '../locators';
import { LazyResourceBasedLocator } from './common/resourceBasedLocator';

/**
 * A wrapper around all locators used by the extension.
 */

export class ExtensionLocators<I = PythonEnvInfo> extends Locators<I> {
    constructor(
        // These are expected to be low-level locators (e.g. system).
        private readonly nonWorkspace: ILocator<I>[],
        // This is expected to be a locator wrapping any found in
        // the workspace (i.e. WorkspaceLocators).
        private readonly workspace: ILocator<I>,
    ) {
        super([...nonWorkspace, workspace]);
    }

    public iterEnvs(query?: PythonLocatorQuery): IPythonEnvsIterator<I> {
        const iterators: IPythonEnvsIterator<I>[] = [this.workspace.iterEnvs(query)];
        if (!query?.searchLocations?.doNotIncludeNonRooted) {
            const nonWorkspace = query?.providerId
                ? this.nonWorkspace.filter((locator) => query.providerId === locator.providerId)
                : this.nonWorkspace;
            iterators.push(...nonWorkspace.map((loc) => loc.iterEnvs(query)));
        }
        return combineIterators(iterators);
    }
}
type WorkspaceLocatorFactoryResult = ILocator<BasicEnvInfo> & Partial<IDisposable>;
type WorkspaceLocatorFactory = (root: Uri) => WorkspaceLocatorFactoryResult[];
type RootURI = string;

export type WatchRootsArgs = {
    initRoot(root: Uri): void;
    addRoot(root: Uri): void;
    removeRoot(root: Uri): void;
};
type WatchRootsFunc = (args: WatchRootsArgs) => IDisposable;
// XXX Factor out RootedLocators and MultiRootedLocators.
/**
 * The collection of all workspace-specific locators used by the extension.
 *
 * The factories are used to produce the locators for each workspace folder.
 */

export class WorkspaceLocators extends LazyResourceBasedLocator {
    public readonly providerId: string = 'workspace-locators';

    private readonly locators: Record<RootURI, [ILocator<BasicEnvInfo>, IDisposable]> = {};

    private readonly roots: Record<RootURI, Uri> = {};

    constructor(private readonly watchRoots: WatchRootsFunc, private readonly factories: WorkspaceLocatorFactory[]) {
        super();
        this.activate().ignoreErrors();
    }

    public async dispose(): Promise<void> {
        await super.dispose();

        // Clear all the roots.
        const roots = Object.keys(this.roots).map((key) => this.roots[key]);
        roots.forEach((root) => this.removeRoot(root));
    }

    protected doIterEnvs(query?: PythonLocatorQuery): IPythonEnvsIterator<BasicEnvInfo> {
        const iterators = Object.keys(this.locators).map((key) => {
            if (query?.searchLocations !== undefined) {
                const root = this.roots[key];
                // Match any related search location.
                const filter = getURIFilter(root, { checkParent: true, checkChild: true });
                // Ignore any requests for global envs.
                if (!query.searchLocations.roots.some(filter)) {
                    // This workspace folder did not match the query, so skip it!
                    return iterEmpty<BasicEnvInfo>();
                }
                if (query.providerId && query.providerId !== this.providerId) {
                    // This is a request for a specific provider, so skip it.
                    return iterEmpty<BasicEnvInfo>();
                }
            }
            // The query matches or was not location-specific.
            const [locator] = this.locators[key];
            return locator.iterEnvs(query);
        });
        return combineIterators(iterators);
    }

    protected async initResources(): Promise<void> {
        const disposable = this.watchRoots({
            initRoot: (root: Uri) => this.addRoot(root),
            addRoot: (root: Uri) => {
                // Drop the old one, if necessary.
                this.removeRoot(root);
                this.addRoot(root);
                this.emitter.fire({ searchLocation: root });
            },
            removeRoot: (root: Uri) => {
                this.removeRoot(root);
                this.emitter.fire({ searchLocation: root });
            },
        });
        this.disposables.push(disposable);
    }

    private addRoot(root: Uri): void {
        // Create the root's locator, wrapping each factory-generated locator.
        const locators: ILocator<BasicEnvInfo>[] = [];
        const disposables = new Disposables();
        this.factories.forEach((create) => {
            create(root).forEach((loc) => {
                locators.push(loc);
                if (loc.dispose !== undefined) {
                    disposables.push(loc as IDisposable);
                }
            });
        });
        const locator = new Locators(locators);
        // Cache it.
        const key = root.toString();
        this.locators[key] = [locator, disposables];
        this.roots[key] = root;
        // Hook up the watchers.
        disposables.push(
            locator.onChanged((e) => {
                if (e.searchLocation === undefined) {
                    e.searchLocation = root;
                }
                this.emitter.fire(e);
            }),
        );
    }

    private removeRoot(root: Uri): void {
        const key = root.toString();
        const found = this.locators[key];
        if (found === undefined) {
            return;
        }
        const [, disposables] = found;
        delete this.locators[key];
        delete this.roots[key];
        disposables.dispose();
    }
}
