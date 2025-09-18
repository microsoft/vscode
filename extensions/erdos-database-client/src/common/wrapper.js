/**
 * wrap origin with ` if is unusual identifier
 * @param origin any string
 */
export function wrapByDb(origin, databaseType) {
    if (origin == null) { return origin; }
    if (databaseType == 'PostgreSQL') {
        return origin.split(".").map(text => `"${text}"`).join(".")
    }
    if (databaseType == 'MongoDB') {
        return origin;
    }

    if (origin.match(/\b[-\s]+\b/ig) || origin.match(/^( |if|key|desc|length|group|order)$/i)) {
        if (databaseType == 'SqlServer') {
            return origin.split(".").map(text => `[${text}]`).join(".")
        }
        return `\`${origin}\``;
    }

    return origin;
}