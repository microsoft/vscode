import * as path from 'path';

/**
 * This function normalizes the provided paths and the existing paths in PYTHONPATH,
 * adds the provided paths to PYTHONPATH if they're not already present,
 * and then returns the updated PYTHONPATH.
 *
 * @param newPaths - An array of paths to be added to PYTHONPATH
 * @param launchPythonPath - The initial PYTHONPATH
 * @returns The updated PYTHONPATH
 */
export function addPathToPythonpath(newPaths: string[], launchPythonPath: string | undefined): string {
    // Split PYTHONPATH into array of paths if it exists
    let paths: string[];
    if (!launchPythonPath) {
        paths = [];
    } else {
        paths = launchPythonPath.split(path.delimiter);
    }

    // Normalize each path in the existing PYTHONPATH
    paths = paths.map((p) => path.normalize(p));

    // Normalize each new path and add it to PYTHONPATH if it's not already present
    newPaths.forEach((newPath) => {
        const normalizedNewPath: string = path.normalize(newPath);

        if (!paths.includes(normalizedNewPath)) {
            paths.push(normalizedNewPath);
        }
    });

    // Join the paths with ':' to create the updated PYTHONPATH
    const updatedPythonPath: string = paths.join(path.delimiter);

    return updatedPythonPath;
}
