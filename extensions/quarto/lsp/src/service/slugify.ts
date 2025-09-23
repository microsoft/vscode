/*
 * slugify.ts
 *
 * Copyright (C) 2023 by Posit Software, PBC
 * Copyright (c) Microsoft Corporation. All rights reserved.
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

import { pandocAutoIdentifier } from "core";
export class Slug {
  public constructor(
    public readonly value: string
  ) { }

  public equals(other: Slug): boolean {
    return this.value === other.value;
  }
}

/**
 * Generates unique ids for headers in the Markdown.
 */
export interface ISlugifier {
  fromHeading(heading: string): Slug;
}

export const pandocSlugifier: ISlugifier = new class implements ISlugifier {
  fromHeading(heading: string): Slug {
    const slugifiedHeading = pandocAutoIdentifier(heading);
    return new Slug(slugifiedHeading);
  }
};
