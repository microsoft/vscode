/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as glob from '../../../../base/common/glob.js';
import { startsWithIgnoreCase } from '../../../../base/common/strings.js';
export class IgnoreFile {
    constructor(contents, location, parent, ignoreCase = false) {
        this.location = location;
        this.parent = parent;
        this.ignoreCase = ignoreCase;
        if (location[location.length - 1] === '\\') {
            throw Error('Unexpected path format, do not use trailing backslashes');
        }
        if (location[location.length - 1] !== '/') {
            location += '/';
        }
        this.isPathIgnored = this.parseIgnoreFile(contents, this.location, this.parent);
    }
    /**
     * Updates the contents of the ignore file. Preserving the location and parent
     * @param contents The new contents of the gitignore file
     */
    updateContents(contents) {
        this.isPathIgnored = this.parseIgnoreFile(contents, this.location, this.parent);
    }
    /**
     * Returns true if a path in a traversable directory has not been ignored.
     *
     * Note: For performance reasons this does not check if the parent directories have been ignored,
     * so it should always be used in tandem with `shouldTraverseDir` when walking a directory.
     *
     * In cases where a path must be tested in isolation, `isArbitraryPathIncluded` should be used.
     */
    isPathIncludedInTraversal(path, isDir) {
        if (path[0] !== '/' || path[path.length - 1] === '/') {
            throw Error('Unexpected path format, expected to begin with slash and end without. got:' + path);
        }
        const ignored = this.isPathIgnored(path, isDir);
        return !ignored;
    }
    /**
     * Returns true if an arbitrary path has not been ignored.
     * This is an expensive operation and should only be used outside of traversals.
     */
    isArbitraryPathIgnored(path, isDir) {
        if (path[0] !== '/' || path[path.length - 1] === '/') {
            throw Error('Unexpected path format, expected to begin with slash and end without. got:' + path);
        }
        const segments = path.split('/').filter(x => x);
        let ignored = false;
        let walkingPath = '';
        for (let i = 0; i < segments.length; i++) {
            const isLast = i === segments.length - 1;
            const segment = segments[i];
            walkingPath = walkingPath + '/' + segment;
            if (!this.isPathIncludedInTraversal(walkingPath, isLast ? isDir : true)) {
                ignored = true;
                break;
            }
        }
        return ignored;
    }
    gitignoreLinesToExpression(lines, dirPath, trimForExclusions) {
        const includeLines = lines.map(line => this.gitignoreLineToGlob(line, dirPath));
        const includeExpression = Object.create(null);
        for (const line of includeLines) {
            includeExpression[line] = true;
        }
        return glob.parse(includeExpression, { trimForExclusions, ignoreCase: this.ignoreCase });
    }
    parseIgnoreFile(ignoreContents, dirPath, parent) {
        const contentLines = ignoreContents
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && line[0] !== '#');
        // Pull out all the lines that end with `/`, those only apply to directories
        const fileLines = contentLines.filter(line => !line.endsWith('/'));
        const fileIgnoreLines = fileLines.filter(line => !line.includes('!'));
        const isFileIgnored = this.gitignoreLinesToExpression(fileIgnoreLines, dirPath, true);
        // TODO: Slight hack... this naive approach may reintroduce too many files in cases of weirdly complex .gitignores
        const fileIncludeLines = fileLines.filter(line => line.includes('!')).map(line => line.replace(/!/g, ''));
        const isFileIncluded = this.gitignoreLinesToExpression(fileIncludeLines, dirPath, false);
        // When checking if a dir is ignored we can use all lines
        const dirIgnoreLines = contentLines.filter(line => !line.includes('!'));
        const isDirIgnored = this.gitignoreLinesToExpression(dirIgnoreLines, dirPath, true);
        // Same hack.
        const dirIncludeLines = contentLines.filter(line => line.includes('!')).map(line => line.replace(/!/g, ''));
        const isDirIncluded = this.gitignoreLinesToExpression(dirIncludeLines, dirPath, false);
        const isPathIgnored = (path, isDir) => {
            if (!(this.ignoreCase ? startsWithIgnoreCase(path, dirPath) : path.startsWith(dirPath))) {
                return false;
            }
            if (isDir && isDirIgnored(path) && !isDirIncluded(path)) {
                return true;
            }
            if (isFileIgnored(path) && !isFileIncluded(path)) {
                return true;
            }
            if (parent) {
                return parent.isPathIgnored(path, isDir);
            }
            return false;
        };
        return isPathIgnored;
    }
    gitignoreLineToGlob(line, dirPath) {
        const firstSep = line.indexOf('/');
        if (firstSep === -1 || firstSep === line.length - 1) {
            line = '**/' + line;
        }
        else {
            if (firstSep === 0) {
                if (dirPath.slice(-1) === '/') {
                    line = line.slice(1);
                }
            }
            else {
                if (dirPath.slice(-1) !== '/') {
                    line = '/' + line;
                }
            }
            line = dirPath + line;
        }
        return line;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWdub3JlRmlsZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL2lnbm9yZUZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUUxRSxNQUFNLE9BQU8sVUFBVTtJQUl0QixZQUNDLFFBQWdCLEVBQ0MsUUFBZ0IsRUFDaEIsTUFBbUIsRUFDbkIsYUFBYSxLQUFLO1FBRmxCLGFBQVEsR0FBUixRQUFRLENBQVE7UUFDaEIsV0FBTSxHQUFOLE1BQU0sQ0FBYTtRQUNuQixlQUFVLEdBQVYsVUFBVSxDQUFRO1FBQ25DLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDNUMsTUFBTSxLQUFLLENBQUMseURBQXlELENBQUMsQ0FBQztRQUN4RSxDQUFDO1FBQ0QsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUMzQyxRQUFRLElBQUksR0FBRyxDQUFDO1FBQ2pCLENBQUM7UUFDRCxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2pGLENBQUM7SUFFRDs7O09BR0c7SUFDSCxjQUFjLENBQUMsUUFBZ0I7UUFDOUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FB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