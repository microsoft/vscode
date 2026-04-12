/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function getCompressedContent(schema) {
    let hasDups = false;
    // visit all schema nodes and collect the ones that are equal
    const equalsByString = new Map();
    const nodeToEquals = new Map();
    const visitSchemas = (next) => {
        if (schema === next) {
            return true;
        }
        const val = JSON.stringify(next);
        if (val.length < 30) {
            // the $ref takes around 25 chars, so we don't save anything
            return true;
        }
        const eq = equalsByString.get(val);
        if (!eq) {
            const newEq = { schemas: [next] };
            equalsByString.set(val, newEq);
            nodeToEquals.set(next, newEq);
            return true;
        }
        eq.schemas.push(next);
        nodeToEquals.set(next, eq);
        hasDups = true;
        return false;
    };
    traverseNodes(schema, visitSchemas);
    equalsByString.clear();
    if (!hasDups) {
        return JSON.stringify(schema);
    }
    let defNodeName = '$defs';
    while (schema.hasOwnProperty(defNodeName)) {
        defNodeName += '_';
    }
    // used to collect all schemas that are later put in `$defs`. The index in the array is the id of the schema.
    const definitions = [];
    function stringify(root) {
        return JSON.stringify(root, (_key, value) => {
            if (value !== root) {
                const eq = nodeToEquals.get(value);
                if (eq && eq.schemas.length > 1) {
                    if (!eq.id) {
                        eq.id = `_${definitions.length}`;
                        definitions.push(eq.schemas[0]);
                    }
                    return { $ref: `#/${defNodeName}/${eq.id}` };
                }
            }
            return value;
        });
    }
    // stringify the schema and replace duplicate subtrees with $ref
    // this will add new items to the definitions array
    const str = stringify(schema);
    // now stringify the definitions. Each invication of stringify cann add new items to the definitions array, so the length can grow while we iterate
    const defStrings = [];
    for (let i = 0; i < definitions.length; i++) {
        defStrings.push(`"_${i}":${stringify(definitions[i])}`);
    }
    if (defStrings.length) {
        return `${str.substring(0, str.length - 1)},"${defNodeName}":{${defStrings.join(',')}}}`;
    }
    return str;
}
function isObject(thing) {
    return typeof thing === 'object' && thing !== null;
}
/*
 * Traverse a JSON schema and visit each schema node
*/
function traverseNodes(root, visit) {
    if (!root || typeof root !== 'object') {
        return;
    }
    const collectEntries = (...entries) => {
        for (const entry of entries) {
            if (isObject(entry)) {
                toWalk.push(entry);
            }
        }
    };
    const collectMapEntries = (...maps) => {
        for (const map of maps) {
            if (isObject(map)) {
                for (const key in map) {
                    const entry = map[key];
                    if (isObject(entry)) {
                        toWalk.push(entry);
                    }
                }
            }
        }
    };
    const collectArrayEntries = (...arrays) => {
        for (const array of arrays) {
            if (Array.isArray(array)) {
                for (const entry of array) {
                    if (isObject(entry)) {
                        toWalk.push(entry);
                    }
                }
            }
        }
    };
    const collectEntryOrArrayEntries = (items) => {
        if (Array.isArray(items)) {
            for (const entry of items) {
                if (isObject(entry)) {
                    toWalk.push(entry);
                }
            }
        }
        else if (isObject(items)) {
            toWalk.push(items);
        }
    };
    const toWalk = [root];
    let next = toWalk.pop();
    while (next) {
        const visitChildern = visit(next);
        if (visitChildern) {
            collectEntries(next.additionalItems, next.additionalProperties, next.not, next.contains, next.propertyNames, next.if, next.then, next.else, next.unevaluatedItems, next.unevaluatedProperties);
            collectMapEntries(next.definitions, next.$defs, next.properties, next.patternProperties, next.dependencies, next.dependentSchemas);
            collectArrayEntries(next.anyOf, next.allOf, next.oneOf, next.prefixItems);
            collectEntryOrArrayEntries(next.items);
        }
        next = toWalk.pop();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvblNjaGVtYS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUF1TGhHLE1BQU0sVUFBVSxvQkFBb0IsQ0FBQyxNQUFtQjtJQUN2RCxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7SUFHcEIsNkRBQTZEO0lBQzdELE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO0lBQ2pELE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxFQUF1QixDQUFDO0lBQ3BELE1BQU0sWUFBWSxHQUFHLENBQUMsSUFBaUIsRUFBRSxFQUFFO1FBQzFDLElBQUksTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3JCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakMsSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHLEVBQUUsRUFBRSxDQUFDO1lBQ3JCLDREQUE0RDtZQUM1RCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxNQUFNLEVBQUUsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ25DLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNULE1BQU0sS0FBSyxHQUFHLEVBQUUsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNsQyxjQUFjLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMvQixZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM5QixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FB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