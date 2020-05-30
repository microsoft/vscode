/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extpath from 'vs/base/common/extpath';
import * as paths from 'vs/base/common/path';
import { URI, uriToFsPath } from 'vs/base/common/uri';
import { equalsIgnoreCase, compare as strCompare, compareIgnoreCase } from 'vs/base/common/strings';
import { Schemas } from 'vs/base/common/network';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { CharCode } from 'vs/base/common/charCode';
import { ParsedExpression, IExpression, parse } from 'vs/base/common/glob';
import { TernarySearchTree } from 'vs/base/common/map';

export function originalFSPath(uri: URI): string {
	return uriToFsPath(uri, true);
}

//#region IExtUri

export interface IExtUri {

	// --- identity

	/**
	 * Compares two uris.
	 *
	 * @param uri1 Uri
	 * @param uri2 Uri
	 * @param ignoreFragment Ignore the fragment (defaults to `false`)
	 */
	compare(uri1: URI, uri2: URI, ignoreFragment?: boolean): number;

	/**
	 * Tests whether two uris are equal
	 *
	 * @param uri1 Uri
	 * @param uri2 Uri
	 * @param ignoreFragment Ignore the fragment (defaults to `false`)
	 */
	isEqual(uri1: URI | undefined, uri2: URI | undefined, ignoreFragment?: boolean): boolean;

	/**
	 * Tests whether a `candidate` URI is a parent or equal of a given `base` URI.
	 *
	 * @param base A uri which is "longer"
	 * @param parentCandidate A uri which is "shorter" then `base`
	 * @param ignoreFragment Ignore the fragment (defaults to `false`)
	 */
	isEqualOrParent(base: URI, parentCandidate: URI, ignoreFragment?: boolean): boolean;

	/**
	 * Creates a key from a resource URI to be used to resource comparison and for resource maps.
	 * @see ResourceMap
	 * @param uri Uri
	 * @param ignoreFragment Ignore the fragment (defaults to `false`)
	 */
	getComparisonKey(uri: URI, ignoreFragment?: boolean): string;

	// --- path math

	basenameOrAuthority(resource: URI): string;

	/**
	 * Returns the basename of the path component of an uri.
	 * @param resource
	 */
	basename(resource: URI): string;

	/**
	 * Returns the extension of the path component of an uri.
	 * @param resource
	 */
	extname(resource: URI): string;
	/**
	 * Return a URI representing the directory of a URI path.
	 *
	 * @param resource The input URI.
	 * @returns The URI representing the directory of the input URI.
	 */
	dirname(resource: URI): URI;
	/**
	 * Join a URI path with path fragments and normalizes the resulting path.
	 *
	 * @param resource The input URI.
	 * @param pathFragment The path fragment to add to the URI path.
	 * @returns The resulting URI.
	 */
	joinPath(resource: URI, ...pathFragment: string[]): URI
	/**
	 * Normalizes the path part of a URI: Resolves `.` and `..` elements with directory names.
	 *
	 * @param resource The URI to normalize the path.
	 * @returns The URI with the normalized path.
	 */
	normalizePath(resource: URI): URI;
	/**
	 *
	 * @param from
	 * @param to
	 */
	relativePath(from: URI, to: URI): string | undefined;
	/**
	 * Resolves an absolute or relative path against a base URI.
	 * The path can be relative or absolute posix or a Windows path
	 */
	resolvePath(base: URI, path: string): URI;

	// --- misc

	/**
	 * Returns true if the URI path is absolute.
	 */
	isAbsolutePath(resource: URI): boolean;
	/**
	 * Tests whether the two authorities are the same
	 */
	isEqualAuthority(a1: string, a2: string): boolean;
	/**
	 * Returns true if the URI path has a trailing path separator
	 */
	hasTrailingPathSeparator(resource: URI, sep?: string): boolean;
	/**
	 * Removes a trailing path separator, if there's one.
	 * Important: Doesn't remove the first slash, it would make the URI invalid
	 */
	removeTrailingPathSeparator(resource: URI, sep?: string): URI;
	/**
	 * Adds a trailing path separator to the URI if there isn't one already.
	 * For example, c:\ would be unchanged, but c:\users would become c:\users\
	 */
	addTrailingPathSeparator(resource: URI, sep?: string): URI;
}

export class ExtUri implements IExtUri {

	constructor(private _ignorePathCasing: (uri: URI) => boolean) { }

	compare(uri1: URI, uri2: URI, ignoreFragment: boolean = false): number {
		// scheme
		let ret = strCompare(uri1.scheme, uri2.scheme);
		if (ret === 0) {
			// authority
			ret = compareIgnoreCase(uri1.authority, uri2.authority);
			if (ret === 0) {
				// path
				ret = this._ignorePathCasing(uri1) ? compareIgnoreCase(uri1.path, uri2.path) : strCompare(uri1.path, uri2.path);
				// query
				if (ret === 0) {
					ret = strCompare(uri1.query, uri2.query);
					// fragment
					if (ret === 0 && !ignoreFragment) {
						ret = strCompare(uri1.fragment, uri2.fragment);
					}
				}
			}
		}
		return ret;
	}

	getComparisonKey(uri: URI, ignoreFragment: boolean = false): string {
		return uri.with({
			path: this._ignorePathCasing(uri) ? uri.path.toLowerCase() : undefined,
			fragment: ignoreFragment ? null : undefined
		}).toString();
	}

	isEqual(uri1: URI | undefined, uri2: URI | undefined, ignoreFragment: boolean = false): boolean {
		if (uri1 === uri2) {
			return true;
		}
		if (!uri1 || !uri2) {
			return false;
		}
		if (uri1.scheme !== uri2.scheme || !isEqualAuthority(uri1.authority, uri2.authority)) {
			return false;
		}
		const p1 = uri1.path, p2 = uri2.path;
		return (p1 === p2 || this._ignorePathCasing(uri1) && equalsIgnoreCase(p1, p2)) && uri1.query === uri2.query && (ignoreFragment || uri1.fragment === uri2.fragment);
	}

	isEqualOrParent(base: URI, parentCandidate: URI, ignoreFragment: boolean = false): boolean {
		if (base.scheme === parentCandidate.scheme) {
			if (base.scheme === Schemas.file) {
				return extpath.isEqualOrParent(originalFSPath(base), originalFSPath(parentCandidate), this._ignorePathCasing(base)) && base.query === parentCandidate.query && (ignoreFragment || base.fragment === parentCandidate.fragment);
			}
			if (isEqualAuthority(base.authority, parentCandidate.authority)) {
				return extpath.isEqualOrParent(base.path, parentCandidate.path, this._ignorePathCasing(base), '/') && base.query === parentCandidate.query && (ignoreFragment || base.fragment === parentCandidate.fragment);
			}
		}
		return false;
	}

	// --- path math

	joinPath(resource: URI, ...pathFragment: string[]): URI {
		return URI.joinPath(resource, ...pathFragment);
	}

	basenameOrAuthority(resource: URI): string {
		return basename(resource) || resource.authority;
	}

	basename(resource: URI): string {
		return paths.posix.basename(resource.path);
	}

	extname(resource: URI): string {
		return paths.posix.extname(resource.path);
	}

	dirname(resource: URI): URI {
		if (resource.path.length === 0) {
			return resource;
		}
		let dirname;
		if (resource.scheme === Schemas.file) {
			dirname = URI.file(paths.dirname(originalFSPath(resource))).path;
		} else {
			dirname = paths.posix.dirname(resource.path);
			if (resource.authority && dirname.length && dirname.charCodeAt(0) !== CharCode.Slash) {
				console.error(`dirname("${resource.toString})) resulted in a relative path`);
				dirname = '/'; // If a URI contains an authority component, then the path component must either be empty or begin with a CharCode.Slash ("/") character
			}
		}
		return resource.with({
			path: dirname
		});
	}

	normalizePath(resource: URI): URI {
		if (!resource.path.length) {
			return resource;
		}
		let normalizedPath: string;
		if (resource.scheme === Schemas.file) {
			normalizedPath = URI.file(paths.normalize(originalFSPath(resource))).path;
		} else {
			normalizedPath = paths.posix.normalize(resource.path);
		}
		return resource.with({
			path: normalizedPath
		});
	}

	relativePath(from: URI, to: URI): string | undefined {
		if (from.scheme !== to.scheme || !isEqualAuthority(from.authority, to.authority)) {
			return undefined;
		}
		if (from.scheme === Schemas.file) {
			const relativePath = paths.relative(originalFSPath(from), originalFSPath(to));
			return isWindows ? extpath.toSlashes(relativePath) : relativePath;
		}
		let fromPath = from.path || '/', toPath = to.path || '/';
		if (this._ignorePathCasing(from)) {
			// make casing of fromPath match toPath
			let i = 0;
			for (const len = Math.min(fromPath.length, toPath.length); i < len; i++) {
				if (fromPath.charCodeAt(i) !== toPath.charCodeAt(i)) {
					if (fromPath.charAt(i).toLowerCase() !== toPath.charAt(i).toLowerCase()) {
						break;
					}
				}
			}
			fromPath = toPath.substr(0, i) + fromPath.substr(i);
		}
		return paths.posix.relative(fromPath, toPath);
	}

	resolvePath(base: URI, path: string): URI {
		if (base.scheme === Schemas.file) {
			const newURI = URI.file(paths.resolve(originalFSPath(base), path));
			return base.with({
				authority: newURI.authority,
				path: newURI.path
			});
		}
		if (path.indexOf('/') === -1) { // no slashes? it's likely a Windows path
			path = extpath.toSlashes(path);
			if (/^[a-zA-Z]:(\/|$)/.test(path)) { // starts with a drive letter
				path = '/' + path;
			}
		}
		return base.with({
			path: paths.posix.resolve(base.path, path)
		});
	}

	// --- misc

	isAbsolutePath(resource: URI): boolean {
		return !!resource.path && resource.path[0] === '/';
	}

	isEqualAuthority(a1: string, a2: string) {
		return a1 === a2 || equalsIgnoreCase(a1, a2);
	}

	hasTrailingPathSeparator(resource: URI, sep: string = paths.sep): boolean {
		if (resource.scheme === Schemas.file) {
			const fsp = originalFSPath(resource);
			return fsp.length > extpath.getRoot(fsp).length && fsp[fsp.length - 1] === sep;
		} else {
			const p = resource.path;
			return (p.length > 1 && p.charCodeAt(p.length - 1) === CharCode.Slash) && !(/^[a-zA-Z]:(\/$|\\$)/.test(resource.fsPath)); // ignore the slash at offset 0
		}
	}

	removeTrailingPathSeparator(resource: URI, sep: string = paths.sep): URI {
		// Make sure that the path isn't a drive letter. A trailing separator there is not removable.
		if (hasTrailingPathSeparator(resource, sep)) {
			return resource.with({ path: resource.path.substr(0, resource.path.length - 1) });
		}
		return resource;
	}

	addTrailingPathSeparator(resource: URI, sep: string = paths.sep): URI {
		let isRootSep: boolean = false;
		if (resource.scheme === Schemas.file) {
			const fsp = originalFSPath(resource);
			isRootSep = ((fsp !== undefined) && (fsp.length === extpath.getRoot(fsp).length) && (fsp[fsp.length - 1] === sep));
		} else {
			sep = '/';
			const p = resource.path;
			isRootSep = p.length === 1 && p.charCodeAt(p.length - 1) === CharCode.Slash;
		}
		if (!isRootSep && !hasTrailingPathSeparator(resource, sep)) {
			return resource.with({ path: resource.path + '/' });
		}
		return resource;
	}
}

/**
 * Unbiased utility that takes uris "as they are". This means it can be interchanged with
 * uri#toString() usages. The following is true
 * ```
 * assertEqual(aUri.toString() === bUri.toString(), exturi.isEqual(aUri, bUri))
 * ```
 */
export const extUri = new ExtUri(() => false);

/**
 * BIASED utility that always ignores the casing of uris path. ONLY use these util if you
 * understand what you are doing.
 *
 * Note that `IUriIdentityService#extUri` is a better replacement for this because that utility
 * knows when path casing matters and when not.
 */
export const extUriIgnorePathCase = new ExtUri(_ => true);

const exturiBiasedIgnorePathCase = new ExtUri(uri => {
	// A file scheme resource is in the same platform as code, so ignore case for non linux platforms
	// Resource can be from another platform. Lowering the case as an hack. Should come from File system provider
	return uri && uri.scheme === Schemas.file ? !isLinux : true;
});

export const isEqual = exturiBiasedIgnorePathCase.isEqual.bind(exturiBiasedIgnorePathCase);
export const isEqualOrParent = exturiBiasedIgnorePathCase.isEqualOrParent.bind(exturiBiasedIgnorePathCase);
export const getComparisonKey = exturiBiasedIgnorePathCase.getComparisonKey.bind(exturiBiasedIgnorePathCase);
export const basenameOrAuthority = exturiBiasedIgnorePathCase.basenameOrAuthority.bind(exturiBiasedIgnorePathCase);
export const basename = exturiBiasedIgnorePathCase.basename.bind(exturiBiasedIgnorePathCase);
export const extname = exturiBiasedIgnorePathCase.extname.bind(exturiBiasedIgnorePathCase);
export const dirname = exturiBiasedIgnorePathCase.dirname.bind(exturiBiasedIgnorePathCase);
export const joinPath = extUri.joinPath.bind(extUri);
export const normalizePath = exturiBiasedIgnorePathCase.normalizePath.bind(exturiBiasedIgnorePathCase);
export const relativePath = exturiBiasedIgnorePathCase.relativePath.bind(exturiBiasedIgnorePathCase);
export const resolvePath = exturiBiasedIgnorePathCase.resolvePath.bind(exturiBiasedIgnorePathCase);
export const isAbsolutePath = exturiBiasedIgnorePathCase.isAbsolutePath.bind(exturiBiasedIgnorePathCase);
export const isEqualAuthority = exturiBiasedIgnorePathCase.isEqualAuthority.bind(exturiBiasedIgnorePathCase);
export const hasTrailingPathSeparator = exturiBiasedIgnorePathCase.hasTrailingPathSeparator.bind(exturiBiasedIgnorePathCase);
export const removeTrailingPathSeparator = exturiBiasedIgnorePathCase.removeTrailingPathSeparator.bind(exturiBiasedIgnorePathCase);
export const addTrailingPathSeparator = exturiBiasedIgnorePathCase.addTrailingPathSeparator.bind(exturiBiasedIgnorePathCase);

//#endregion

export function distinctParents<T>(items: T[], resourceAccessor: (item: T) => URI): T[] {
	const distinctParents: T[] = [];
	for (let i = 0; i < items.length; i++) {
		const candidateResource = resourceAccessor(items[i]);
		if (items.some((otherItem, index) => {
			if (index === i) {
				return false;
			}

			return isEqualOrParent(candidateResource, resourceAccessor(otherItem));
		})) {
			continue;
		}

		distinctParents.push(items[i]);
	}

	return distinctParents;
}

/**
 * Data URI related helpers.
 */
export namespace DataUri {

	export const META_DATA_LABEL = 'label';
	export const META_DATA_DESCRIPTION = 'description';
	export const META_DATA_SIZE = 'size';
	export const META_DATA_MIME = 'mime';

	export function parseMetaData(dataUri: URI): Map<string, string> {
		const metadata = new Map<string, string>();

		// Given a URI of:  data:image/png;size:2313;label:SomeLabel;description:SomeDescription;base64,77+9UE5...
		// the metadata is: size:2313;label:SomeLabel;description:SomeDescription
		const meta = dataUri.path.substring(dataUri.path.indexOf(';') + 1, dataUri.path.lastIndexOf(';'));
		meta.split(';').forEach(property => {
			const [key, value] = property.split(':');
			if (key && value) {
				metadata.set(key, value);
			}
		});

		// Given a URI of:  data:image/png;size:2313;label:SomeLabel;description:SomeDescription;base64,77+9UE5...
		// the mime is: image/png
		const mime = dataUri.path.substring(0, dataUri.path.indexOf(';'));
		if (mime) {
			metadata.set(META_DATA_MIME, mime);
		}

		return metadata;
	}
}

export class ResourceGlobMatcher {

	private readonly globalExpression: ParsedExpression;
	private readonly expressionsByRoot: TernarySearchTree<URI, { root: URI, expression: ParsedExpression }> = TernarySearchTree.forUris<{ root: URI, expression: ParsedExpression }>();

	constructor(
		globalExpression: IExpression,
		rootExpressions: { root: URI, expression: IExpression }[]
	) {
		this.globalExpression = parse(globalExpression);
		for (const expression of rootExpressions) {
			this.expressionsByRoot.set(expression.root, { root: expression.root, expression: parse(expression.expression) });
		}
	}

	matches(resource: URI): boolean {
		const rootExpression = this.expressionsByRoot.findSubstr(resource);
		if (rootExpression) {
			const path = relativePath(rootExpression.root, resource);
			if (path && !!rootExpression.expression(path)) {
				return true;
			}
		}
		return !!this.globalExpression(resource.path);
	}
}

export function toLocalResource(resource: URI, authority: string | undefined): URI {
	if (authority) {
		let path = resource.path;
		if (path && path[0] !== paths.posix.sep) {
			path = paths.posix.sep + path;
		}

		return resource.with({ scheme: Schemas.vscodeRemote, authority, path });
	}

	return resource.with({ scheme: Schemas.file });
}
