/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
/**
 * Helper for creating and parsing browser view URIs.
 */
export var BrowserViewUri;
(function (BrowserViewUri) {
    BrowserViewUri.scheme = Schemas.vscodeBrowser;
    /**
     * Creates a resource URI for a browser view with the given ID.
     */
    function forId(id) {
        return URI.from({ scheme: BrowserViewUri.scheme, path: `/${id}` });
    }
    BrowserViewUri.forId = forId;
    /**
     * Parses a browser view resource URI to extract the ID.
     */
    function parse(resource) {
        if (resource.scheme !== BrowserViewUri.scheme) {
            return undefined;
        }
        // Remove leading slash if present
        const id = resource.path.startsWith('/') ? resource.path.substring(1) : resource.path;
        if (!id) {
            return undefined;
        }
        return { id };
    }
    BrowserViewUri.parse = parse;
    /**
     * Extracts the ID from a browser view resource URI.
     */
    function getId(resource) {
        return parse(resource)?.id;
    }
    BrowserViewUri.getId = getId;
})(BrowserViewUri || (BrowserViewUri = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXdVcmkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXdVcmkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVsRDs7R0FFRztBQUNILE1BQU0sS0FBVyxjQUFjLENBa0M5QjtBQWxDRCxXQUFpQixjQUFjO0lBRWpCLHFCQUFNLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQztJQUU1Qzs7T0FFRztJQUNILFNBQWdCLEtBQUssQ0FBQyxFQUFVO1FBQy9CLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBTixlQUFBLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUZlLG9CQUFLLFFBRXBCLENBQUE7SUFFRDs7T0FFRztJQUNILFNBQWdCLEtBQUssQ0FBQyxRQUFhO1FBQ2xDLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxlQUFBLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO1FBQ3RGLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNULE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFDZixDQUFDO0lBWmUsb0JBQUssUUFZcEIsQ0FBQTtJQUVEOztPQUVHO0lBQ0gsU0FBZ0IsS0FBSyxDQUFDLFFBQWE7UUFDbEMsT0FBTyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDO0lBQzVCLENBQUM7SUFGZSxvQkFBSyxRQUVwQixDQUFBO0FBQ0YsQ0FBQyxFQWxDZ0IsY0FBYyxLQUFkLGNBQWMsUUFrQzlCIn0=