/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IWebContentExtractorService = createDecorator('IWebContentExtractorService');
export const ISharedWebContentExtractorService = createDecorator('ISharedWebContentExtractorService');
/**
 * A service that extracts web content from a given URI.
 * This is a placeholder implementation that does not perform any actual extraction.
 * It's intended to be used on platforms where web content extraction is not supported such as in the browser.
 */
export class NullWebContentExtractorService {
    extract(_uri) {
        throw new Error('Not implemented');
    }
}
export class NullSharedWebContentExtractorService {
    readImage(_uri, _token) {
        throw new Error('Not implemented');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViQ29udGVudEV4dHJhY3Rvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvY29tbW9uL3dlYkNvbnRlbnRFeHRyYWN0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLGVBQWUsQ0FBOEIsNkJBQTZCLENBQUMsQ0FBQztBQUN2SCxNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyxlQUFlLENBQW9DLG1DQUFtQyxDQUFDLENBQUM7QUFpQ3pJOzs7O0dBSUc7QUFDSCxNQUFNLE9BQU8sOEJBQThCO0lBRzFDLE9BQU8sQ0FBQyxJQUFXO1FBQ2xCLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNwQyxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sb0NBQW9DO0lBRWhELFNBQVMsQ0FBQyxJQUFTLEVBQUUsTUFBeUI7UUFDN0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7Q0FDRCJ9