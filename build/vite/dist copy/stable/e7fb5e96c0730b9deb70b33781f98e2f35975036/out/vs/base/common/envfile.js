/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Parses a standard .env/.envrc file into a map of the environment variables
 * it defines.
 *
 * todo@connor4312: this can go away (if only used in Node.js targets) and be
 * replaced with `util.parseEnv`. However, currently calling that makes the
 * extension host crash.
 */
export function parseEnvFile(src) {
    const result = new Map();
    // Normalize line breaks
    const normalizedSrc = src.replace(/\r\n?/g, '\n');
    const lines = normalizedSrc.split('\n');
    for (let line of lines) {
        // Skip empty lines and comments
        line = line.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        // Parse the line into key and value
        const [key, value] = parseLine(line);
        if (key) {
            result.set(key, value);
        }
    }
    return result;
    function parseLine(line) {
        // Handle export prefix
        if (line.startsWith('export ')) {
            line = line.substring(7).trim();
        }
        // Find the key-value separator
        const separatorIndex = findIndexOutsideQuotes(line, c => c === '=' || c === ':');
        if (separatorIndex === -1) {
            return [null, null];
        }
        const key = line.substring(0, separatorIndex).trim();
        let value = line.substring(separatorIndex + 1).trim();
        // Handle comments and remove them
        const commentIndex = findIndexOutsideQuotes(value, c => c === '#');
        if (commentIndex !== -1) {
            value = value.substring(0, commentIndex).trim();
        }
        // Process quoted values
        if (value.length >= 2) {
            const firstChar = value[0];
            const lastChar = value[value.length - 1];
            if ((firstChar === '"' && lastChar === '"') ||
                (firstChar === '\'' && lastChar === '\'') ||
                (firstChar === '`' && lastChar === '`')) {
                // Remove surrounding quotes
                value = value.substring(1, value.length - 1);
                // Handle escaped characters in double quotes
                if (firstChar === '"') {
                    value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
                }
            }
        }
        return [key, value];
    }
    function findIndexOutsideQuotes(text, predicate) {
        let inQuote = false;
        let quoteChar = '';
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (inQuote) {
                if (char === quoteChar && text[i - 1] !== '\\') {
                    inQuote = false;
                }
            }
            else if (char === '"' || char === '\'' || char === '`') {
                inQuote = true;
                quoteChar = char;
            }
            else if (predicate(char)) {
                return i;
            }
        }
        return -1;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52ZmlsZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2VudmZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEc7Ozs7Ozs7R0FPRztBQUNILE1BQU0sVUFBVSxZQUFZLENBQUMsR0FBVztJQUN2QyxNQUFNLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztJQUV6Qyx3QkFBd0I7SUFDeEIsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDbEQsTUFBTSxLQUFLLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUV4QyxLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO1FBQ3hCLGdDQUFnQztRQUNoQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ25CLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ25DLFNBQVM7UUFDVixDQUFDO1FBRUQsb0NBQW9DO1FBQ3BDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JDLElBQUksR0FBRyxFQUFFLENBQUM7WUFDVCxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4QixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0lBRWQsU0FBUyxTQUFTLENBQUMsSUFBWTtRQUM5Qix1QkFBdUI7UUFDdkIsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDaEMsSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFD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