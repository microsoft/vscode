/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function getNLSMessages() {
    return globalThis._VSCODE_NLS_MESSAGES;
}
export function getNLSLanguage() {
    return globalThis._VSCODE_NLS_LANGUAGE;
}
const isPseudo = getNLSLanguage() === 'pseudo' || (typeof document !== 'undefined' && document.location && typeof document.location.hash === 'string' && document.location.hash.indexOf('pseudo=true') >= 0);
function _format(message, args) {
    let result;
    if (args.length === 0) {
        result = message;
    }
    else {
        result = message.replace(/\{(\d+)\}/g, (match, rest) => {
            const index = rest[0];
            const arg = args[index];
            let result = match;
            if (typeof arg === 'string') {
                result = arg;
            }
            else if (typeof arg === 'number' || typeof arg === 'boolean' || arg === void 0 || arg === null) {
                result = String(arg);
            }
            return result;
        });
    }
    if (isPseudo) {
        // FF3B and FF3D is the Unicode zenkaku representation for [ and ]
        result = '\uFF3B' + result.replace(/[aouei]/g, '$&$&') + '\uFF3D';
    }
    return result;
}
/**
 * @skipMangle
 */
export function localize(data /* | number when built */, message /* | null when built */, ...args) {
    if (typeof data === 'number') {
        return _format(lookupMessage(data, message), args);
    }
    return _format(message, args);
}
/**
 * Only used when built: Looks up the message in the global NLS table.
 * This table is being made available as a global through bootstrapping
 * depending on the target context.
 */
function lookupMessage(index, fallback) {
    const message = getNLSMessages()?.[index];
    if (typeof message !== 'string') {
        if (typeof fallback === 'string') {
            return fallback;
        }
        throw new Error(`!!! NLS MISSING: ${index} !!!`);
    }
    return message;
}
/**
 * @skipMangle
 */
export function localize2(data /* | number when built */, originalMessage, ...args) {
    let message;
    if (typeof data === 'number') {
        message = lookupMessage(data, originalMessage);
    }
    else {
        message = originalMessage;
    }
    const value = _format(message, args);
    return {
        value,
        original: originalMessage === message ? value : _format(originalMessage, args)
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvbmxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE1BQU0sVUFBVSxjQUFjO0lBQzdCLE9BQU8sVUFBVSxDQUFDLG9CQUFvQixDQUFDO0FBQ3hDLENBQUM7QUFFRCxNQUFNLFVBQVUsY0FBYztJQUM3QixPQUFPLFVBQVUsQ0FBQyxvQkFBb0IsQ0FBQztBQUN4QyxDQUFDO0FBR0QsTUFBTSxRQUFRLEdBQUcsY0FBYyxFQUFFLEtBQUssUUFBUSxJQUFJLENBQUMsT0FBTyxRQUFRLEtBQUssV0FBVyxJQUFJLFFBQVEsQ0FBQyxRQUFRLElBQUksT0FBTyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBWTdNLFNBQVMsT0FBTyxDQUFDLE9BQWUsRUFBRSxJQUFzRDtJQUN2RixJQUFJLE1BQWMsQ0FBQztJQUVuQixJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdkIsTUFBTSxHQUFHLE9BQU8sQ0FBQztJQUNsQixDQUFDO1NBQU0sQ0FBQztRQUNQLE1BQU0sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRTtZQUN0RCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3hCLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQztZQUNuQixJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUM3QixNQUFNLEdBQUcsR0FBRyxDQUFDO1lBQ2QsQ0FBQztpQkFBTSxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsSUFBSSxPQUFPLEdBQUcsS0FBSyxTQUFTLElBQUksR0FBRyxLQUFLLEtBQUssQ0FBQyxJQUFJLEdBQUcsS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDbEcsTUFBTSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN0QixDQUFDO1lBQ0QsT0FBTyxNQUFNLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ2Qsa0VBQWtFO1FBQ2xFLE1BQU0sR0FBRyxRQUFRLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDO0lBQ25FLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUE4QkQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsUUFBUSxDQUFDLElBQTRCLENBQUMseUJBQXlCLEVBQUUsT0FBZSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsSUFBc0Q7SUFDbEwsSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM5QixPQUFPLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFDRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDL0IsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxTQUFTLGFBQWEsQ0FBQyxLQUFhLEVBQUUsUUFBdUI7SUFDNUQsTUFBTSxPQUFPLEdBQUcsY0FBYyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMxQyxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ2pDLElBQUksT0FBTyxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDbEMsT0FBTyxRQUFRLENBQUM7UUFDakIsQ0FBQztRQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLEtBQUssTUFBTSxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUNELE9BQU8sT0FBTyxDQUFDO0FBQ2hCLENBQUM7QUFnQ0Q7O0dBRUc7QUFDSCxNQUFNLFVBQVUsU0FBUyxDQUFDLElBQTRCLENBQUMseUJBQXlCLEVBQUUsZUFBdUIsRUFBRSxHQUFHLElBQXNEO0lBQ25LLElBQUksT0FBZSxDQUFDO0lBQ3BCLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDOUIsT0FBTyxHQUFHLGFBQWEsQ0FBQyxJQUFJLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFDaEQsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLEdBQUcsZUFBZSxDQUFDO0lBQzNCLENBQUM7SUFFRCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBRXJDLE9BQU87UUFDTixLQUFLO1FBQ0wsUUFBUSxFQUFFLGVBQWUsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUM7S0FDOUUsQ0FBQztBQUNILENBQUMifQ==