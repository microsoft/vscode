/*
 * datacite.ts
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

import { DataCiteRecord } from 'editor-types';


export function suggestCiteId(record: DataCiteRecord): string {
  // Try to use the last name (or the first name)
  let suggestedId = '';
  if (record.creators && record.creators.length > 0) {
    suggestedId = record.creators[0].familyName || record.creators[0].fullName;
  }

  // Try to read the year
  if (record.publicationYear) {
    suggestedId = suggestedId + record.publicationYear;
  }
  return suggestedId;
}
