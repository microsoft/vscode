import { isString } from './types.js';
const _codiconFontCharacters = Object.create(null);
export function register(id, fontCharacter) {
    if (isString(fontCharacter)) {
        const val = _codiconFontCharacters[fontCharacter];
        if (val === undefined) {
            throw new Error(`${id} references an unknown codicon: ${fontCharacter}`);
        }
        fontCharacter = val;
    }
    _codiconFontCharacters[id] = fontCharacter;
    return { id };
}
/**
 * Only to be used by the iconRegistry.
 */
export function getCodiconFontCharacters() {
    return _codiconFontCharacters;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kaWNvbnNVdGlsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vY29kaWNvbnNVdGlsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUtBLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFHdEMsTUFBTSxzQkFBc0IsR0FBNkIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUU3RSxNQUFNLFVBQVUsUUFBUSxDQUFDLEVBQVUsRUFBRSxhQUE4QjtJQUNsRSxJQUFJLFFBQVEsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQzdCLE1BQU0sR0FBRyxHQUFHLHNCQUFzQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2xELElBQUksR0FBRyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sSUFBSSxLQUFLLENBQUMsR0FBRyxFQUFFLG1DQUFtQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQzFFLENBQUM7UUFDRCxhQUFhLEdBQUcsR0FBRyxDQUFDO0lBQ3JCLENBQUM7SUFDRCxzQkFBc0IsQ0FBQyxFQUFFLENBQUMsR0FBRyxhQUFhLENBQUM7SUFDM0MsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDO0FBQ2YsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLHdCQUF3QjtJQUN2QyxPQUFPLHNCQUFzQixDQUFDO0FBQy9CLENBQUMifQ==