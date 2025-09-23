/*
 * image.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

export interface ImageDimensions {
  naturalWidth: number | null;
  naturalHeight: number | null;
  containerWidth: number;
}

export interface EditorUIImageResolver {
  // resolve image uris (make relative, copy to doc local 'images' dir, etc)
  resolveImageUris: (uris: string[]) => Promise<string[]>;

  // resolve base64 images (copy to doc local 'images' dir)
  resolveBase64Images?: (base64Images: string[]) => Promise<string[]>; 

  // prompt for a local image using a dialog
  selectImage?: () => Promise<string | null>;
}



