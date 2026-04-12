/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Token, TokenizationResult, EncodedTokenizationResult } from '../languages.js';
export const NullState = new class {
    clone() {
        return this;
    }
    equals(other) {
        return (this === other);
    }
};
export function nullTokenize(languageId, state) {
    return new TokenizationResult([new Token(0, '', languageId)], state);
}
export function nullTokenizeEncoded(languageId, state) {
    const tokens = new Uint32Array(2);
    tokens[0] = 0;
    tokens[1] = ((languageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)
        | (0 /* StandardTokenType.Other */ << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */)
        | (0 /* FontStyle.None */ << 11 /* MetadataConsts.FONT_STYLE_OFFSET */)
        | (1 /* ColorId.DefaultForeground */ << 15 /* MetadataConsts.FOREGROUND_OFFSET */)
        | (2 /* ColorId.DefaultBackground */ << 24 /* MetadataConsts.BACKGROUND_OFFSET */)) >>> 0;
    return new EncodedTokenizationResult(tokens, [], state === null ? NullState : state);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnVsbFRva2VuaXplLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbnVsbFRva2VuaXplLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQUUseUJBQXlCLEVBQVUsTUFBTSxpQkFBaUIsQ0FBQztBQUcvRixNQUFNLENBQUMsTUFBTSxTQUFTLEdBQVcsSUFBSTtJQUM3QixLQUFLO1FBQ1gsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ00sTUFBTSxDQUFDLEtBQWE7UUFDMUIsT0FBTyxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQztJQUN6QixDQUFDO0NBQ0QsQ0FBQztBQUVGLE1BQU0sVUFBVSxZQUFZLENBQUMsVUFBa0IsRUFBRSxLQUFhO0lBQzdELE9BQU8sSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUN0RSxDQUFDO0FBRUQsTUFBTSxVQUFVLG1CQUFtQixDQUFDLFVBQXNCLEVBQUUsS0FBb0I7SUFDL0UsTUFBTSxNQUFNLEdBQUcsSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNkLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUNYLENBQUMsVUFBVSw0Q0FBb0MsQ0FBQztVQUM5QyxDQUFDLDJFQUEyRCxDQUFDO1VBQzdELENBQUMsbUVBQWtELENBQUM7VUFDcEQsQ0FBQyw4RUFBNkQsQ0FBQztVQUMvRCxDQUFDLDhFQUE2RCxDQUFDLENBQ2pFLEtBQUssQ0FBQyxDQUFDO0lBRVIsT0FBTyxJQUFJLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN0RixDQUFDIn0=