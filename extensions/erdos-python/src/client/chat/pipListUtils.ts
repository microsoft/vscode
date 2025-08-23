// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export interface PipPackage {
    name: string;
    version: string;
    displayName: string;
    description: string;
}
export function parsePipList(data: string): PipPackage[] {
    const collection: PipPackage[] = [];

    const lines = data.split('\n').splice(2);
    for (let line of lines) {
        if (line.trim() === '' || line.startsWith('Package') || line.startsWith('----') || line.startsWith('[')) {
            continue;
        }
        const parts = line.split(' ').filter((e) => e);
        if (parts.length > 1) {
            const name = parts[0].trim();
            const version = parts[1].trim();
            const pkg = {
                name,
                version,
                displayName: name,
                description: version,
            };
            collection.push(pkg);
        }
    }
    return collection;
}
