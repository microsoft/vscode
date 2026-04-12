/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getMediaMime, Mimes } from '../../../base/common/mime.js';
import { extname } from '../../../base/common/path.js';
const webviewMimeTypes = new Map([
    ['.svg', 'image/svg+xml'],
    ['.txt', Mimes.text],
    ['.css', 'text/css'],
    ['.js', 'application/javascript'],
    ['.cjs', 'application/javascript'],
    ['.mjs', 'application/javascript'],
    ['.json', 'application/json'],
    ['.html', 'text/html'],
    ['.htm', 'text/html'],
    ['.xhtml', 'application/xhtml+xml'],
    ['.oft', 'font/otf'],
    ['.xml', 'application/xml'],
    ['.wasm', 'application/wasm'],
]);
export function getWebviewContentMimeType(resource) {
    const ext = extname(resource.fsPath).toLowerCase();
    return webviewMimeTypes.get(ext) || getMediaMime(resource.fsPath) || Mimes.unknown;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWltZVR5cGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd2Vidmlldy9jb21tb24vbWltZVR5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBR3ZELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDaEMsQ0FBQyxNQUFNLEVBQUUsZUFBZSxDQUFDO0lBQ3pCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDcEIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDO0lBQ3BCLENBQUMsS0FBSyxFQUFFLHdCQUF3QixDQUFDO0lBQ2pDLENBQUMsTUFBTSxFQUFFLHdCQUF3QixDQUFDO0lBQ2xDLENBQUMsTUFBTSxFQUFFLHdCQUF3QixDQUFDO0lBQ2xDLENBQUMsT0FBTyxFQUFFLGtCQUFrQixDQUFDO0lBQzdCLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQztJQUN0QixDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUM7SUFDckIsQ0FBQyxRQUFRLEVBQUUsdUJBQXVCLENBQUM7SUFDbkMsQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDO0lBQ3BCLENBQUMsTUFBTSxFQUFFLGlCQUFpQixDQUFDO0lBQzNCLENBQUMsT0FBTyxFQUFFLGtCQUFrQixDQUFDO0NBQzdCLENBQUMsQ0FBQztBQUVILE1BQU0sVUFBVSx5QkFBeUIsQ0FBQyxRQUFhO0lBQ3RELE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDbkQsT0FBTyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDO0FBQ3BGLENBQUMifQ==