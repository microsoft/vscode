/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function countChanges(changes) {
    return changes.reduce((count, change) => {
        const diff = change.diff.get();
        // When we accept some of the cell insert/delete the items might still be in the list.
        if (diff.identical) {
            return count;
        }
        switch (change.type) {
            case 'delete':
                return count + 1; // We want to see 1 deleted entry in the pill for navigation
            case 'insert':
                return count + 1; // We want to see 1 new entry in the pill for navigation
            case 'modified':
                return count + diff.changes.length;
            default:
                return count;
        }
    }, 0);
}
export function sortCellChanges(changes) {
    const indexes = new Map();
    changes.forEach((c, i) => indexes.set(c, i));
    return [...changes].sort((a, b) => {
        // For unchanged and modified, use modifiedCellIndex
        if ((a.type === 'unchanged' || a.type === 'modified') &&
            (b.type === 'unchanged' || b.type === 'modified')) {
            return a.modifiedCellIndex - b.modifiedCellIndex;
        }
        // For delete entries, use originalCellIndex
        if (a.type === 'delete' && b.type === 'delete') {
            return a.originalCellIndex - b.originalCellIndex;
        }
        // For insert entries, use modifiedCellIndex
        if (a.type === 'insert' && b.type === 'insert') {
            return a.modifiedCellIndex - b.modifiedCellIndex;
        }
        if (a.type === 'delete' && b.type === 'insert') {
            // If the deleted cell comes before the inserted cell, we want the delete to come first
            // As this means the cell was deleted before it was inserted
            // We would like to see the deleted cell first in the list
            // Else in the UI it would look weird to see an inserted cell before a deleted cell,
            // When the users operation was to first delete the cell and then insert a new one
            // I.e. this is merely just a simple way to ensure we have a stable sort.
            return indexes.get(a) - indexes.get(b);
        }
        if (a.type === 'insert' && b.type === 'delete') {
            // If the deleted cell comes before the inserted cell, we want the delete to come first
            // As this means the cell was deleted before it was inserted
            // We would like to see the deleted cell first in the list
            // Else in the UI it would look weird to see an inserted cell before a deleted cell,
            // When the users operation was to first delete the cell and then insert a new one
            // I.e. this is merely just a simple way to ensure we have a stable sort.
            return indexes.get(a) - indexes.get(b);
        }
        if ((a.type === 'delete' && b.type !== 'insert') || (a.type !== 'insert' && b.type === 'delete')) {
            return a.originalCellIndex - b.originalCellIndex;
        }
        // Mixed types: compare based on available indices
        const aIndex = a.type === 'delete' ? a.originalCellIndex :
            (a.type === 'insert' ? a.modifiedCellIndex : a.modifiedCellIndex);
        const bIndex = b.type === 'delete' ? b.originalCellIndex :
            (b.type === 'insert' ? b.modifiedCellIndex : b.modifiedCellIndex);
        return aIndex - bIndex;
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsQ2hhbmdlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9ub3RlYm9va0NlbGxDaGFuZ2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBNERoRyxNQUFNLFVBQVUsWUFBWSxDQUFDLE9BQXdCO0lBQ3BELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUN2QyxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQy9CLHNGQUFzRjtRQUN0RixJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNwQixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxRQUFRLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNyQixLQUFLLFFBQVE7Z0JBQ1osT0FBTyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsNERBQTREO1lBQy9FLEtBQUssUUFBUTtnQkFDWixPQUFPLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyx3REFBd0Q7WUFDM0UsS0FBSyxVQUFVO2dCQUNkLE9BQU8sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDO1lBQ3BDO2dCQUNDLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztJQUNGLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUVQLENBQUM7QUFFRCxNQUFNLFVBQVUsZUFBZSxDQUFDLE9BQXdCO0lBQ3ZELE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxFQUF5QixDQUFDO0lBQ2pELE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMs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