/*
 * source.ts
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


import { 
  CSLDate,
  CSLName,
  ZoteroCSL, 
  ZoteroCollection, 
  ZoteroCollectionSource, 
  ZoteroCollectionSpec, 
  ZoteroResult 
} from "editor-types";

import { Database } from "node-sqlite3-wasm";

import { zoteroDataDir } from "./datadir.js";
import { withZoteroDb } from "./db.js";
import { equalsIgnoreCase } from "../../../../../core/src/text.js";
import { resolveCslJsonCheaterKeys } from "../util.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function zoteroLocalCollectionSource(dataDir?: string) : ZoteroCollectionSource {
 
  // resolve data dir
  dataDir = zoteroDataDir(dataDir);
  return {
    async getCollections(collections: string[], cached: ZoteroCollectionSpec[]) : Promise<ZoteroResult> {
      if (dataDir) {
        try {
         
           // get collections
          const collectionsResult = await withZoteroDb<ZoteroCollection[]>(dataDir, async (db: Database) => {
            
             // get all local libraries
            const userCollections = getCollections(db, true);

            // divide collections into up to date and need to download
            const upToDateCollections: ZoteroCollection[] = [];
            const downloadCollections: Array<{ name: string, spec: ZoteroCollectionSpec}> = [];
            for (const { name, version, key, parentKey } of userCollections) {
              // filter on requested
              const requested = collections.find(coll => equalsIgnoreCase(coll, name));
              if (requested) {
                // see if we need to download this collection from the db
                const cacheSpec = cached.find(x => equalsIgnoreCase(x.name, name));
                if (cacheSpec) {
                  const collectionSpec = { name, key, parentKey, version };
                  // If the version is 0 this is a local instance that isn't incrementing version numbers, do not cache
                  if (cacheSpec.version !== version || cacheSpec.version === 0) {
                    // zoteroTrace("Need to update collection " + name);
                    downloadCollections.push( { name, spec: collectionSpec });
                  } else {
                    // zoteroTrace("Collection " + name + " is up to date.");
                    upToDateCollections.push( {...collectionSpec, items: [] });
                  }
                } else {
                  downloadCollections.push({ name, spec: { name, key, parentKey, version }});
                }
              }
            }
          
            // read collections we need to then append them to already up to date collections
            const resultCollections = upToDateCollections;
            for (const { spec } of downloadCollections) {
              resultCollections.push(getCollection(db, spec));
            }
           
            // return 
            return resultCollections;
          });

          // return result
          return {
            status: 'ok',
            message: collectionsResult,
            warning: '',
            error: ''
          }
        } catch(error) {
          console.error(error);
          return handleZoteroError(error);
        }
      } else {
        return zoteroResultEmpty();
      }
    },

    async getLibraryNames(): Promise<ZoteroResult> {
      if (dataDir) {
        try {  
          const libraries = await withZoteroDb<string[]>(dataDir, async (db: Database) => {
            return getCollections(db)
              .filter(collection => !collection.parentKey)
              .map(collection => collection.name)
          });
          return {
            status: "ok",
            message: libraries,
            warning: '',
            error: ''
          }
        } catch(error) {
          return handleZoteroError(error);
        }
      } else {
        return zoteroResultEmpty();
      }
      
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getActiveCollectionSpecs(collections: string[]): Promise<ZoteroResult> {
      if (dataDir) {

        try {  
          const specs = await withZoteroDb<ZoteroCollectionSpec[]>(dataDir, async (db: Database) => {
            
            // get all collections
            const allCollections = getCollections(db);
            
            // find the parent of a given collection
            const findParentSpec = (spec: ZoteroCollectionSpec) => {
              if (spec.parentKey.length > 0) {
                return allCollections.find(coll => coll.key === spec.parentKey);
              } else {
                return undefined;
              }
            }

            // filter on the passed collections if need be
            if (collections.length > 0) {

              return allCollections.filter(spec => {
                // find the top-level library of the spec (when the loop terminates
                // the targetSpec will be the library spec)
                let targetSpec = spec;
                for (;;)
                {
                  const parentSpec = findParentSpec(targetSpec);
                  if (!parentSpec) {
                    break;
                  } else {
                    targetSpec = parentSpec;
                  }
                }

                // see if that library is in the list of passed collections
                return collections.includes(targetSpec.name);
              })
            } else {
              return allCollections;
            }
          });

          return {
            status: "ok",
            message: specs,
            warning: '',
            error: ''
          }
        } catch(error) {
          return handleZoteroError(error);
        }
      } else {
        return zoteroResultEmpty();
      }
    }
  };
}

function handleZoteroError(error: unknown) : ZoteroResult {
  return {
    status: 'error',
    message: null,
    warning: '',
    error: error instanceof Error ? error.message : JSON.stringify(error)
  }
}

function zoteroResultEmpty(message = []) : ZoteroResult {
  return {
    status: 'ok',
    message,
    warning: '',
    error: ''
  }
}

interface ZoteroCreator {
  firstName: string;
  lastName: string;
  creatorType: string;
};


function getCreators(db: Database, spec: ZoteroCollectionSpec) : Map<string,ZoteroCreator[]> {
  
  const creators = new Map<string,ZoteroCreator[]>(); 

  for (const row of db.all(...creatorsSQL(spec)) as Array<Record<string,string>>) {
    // get key and ensure it exists
    const key = row["key"];
    if (!creators.has(key)) {
      creators.set(key, []);
    }

    // add the creator
    creators.get(key)?.push({
      firstName: row["firstName"] || "",
      lastName: row["lastName"] || "",
      creatorType: row["creatorType"] || ""
    });
  }

  return creators;
}

function getCollection(db: Database, spec: ZoteroCollectionSpec) : ZoteroCollection {

  // default to return in case of error
  const collection = { ...spec, items: [] } as ZoteroCollection;

  try {
    // get creators
    const creators = getCreators(db, spec);

    // query items and match up with creators
    const currentItem = new Map<string,string>();
    const items: ZoteroCSL[] = [];
    for (const row of db.all(...collectionSQL(spec)) as Array<Record<string,string>>) {

      const key = row["key"];
      const currentKey = currentItem.get("key") || "";
      
      // inception
      if (currentKey.length === 0)
      {
        currentItem.set("key", key);
      }

      // finished an item
      else if (key != currentKey)
      {
        const csl = sqliteItemToCSL(spec.key, currentItem, creators);
        if (csl) {
          items.push(csl);
        }
        currentItem.clear();
        currentItem.set("key", key);
      }

      // read the csl name value pairs
      const name = row["name"];
      const value = String(row["value"]);
      if (name && value) {
        currentItem.set(name, value);
      }
    }

    // handle the last item
    if (currentItem.has("key")) {
      const csl = sqliteItemToCSL(spec.key, currentItem, creators);
      if (csl) {
        items.push(csl);
      }
    }

    // get collection version
    const version = getCollectionVersion(db, spec);
    
    // return collection
    collection.version = version;
    collection.items = items;
    return collection;

  } catch (error) {
    console.error(error);
    return collection;
  }
}

function sqliteItemToCSL(libraryID: string, item: Map<string,string>, creators: Map<string,ZoteroCreator[]>) : ZoteroCSL | null {
   
  const zoteroType = item.get("type");
  if (zoteroType) {
    
    const csl : ZoteroCSL = { libraryID, collectionKeys: [], type: cslType(zoteroType) };
    const cslNames = cslFieldNames(zoteroType);

    // Process the fields. This will either just apply the field
    // as if to the json or will transform the name and/or value
    // before applying the field to the json.
    item.forEach((fieldValue, zoteroFieldName) => {
       
      // convert the name to the proper CSL name
       let fieldName = zoteroFieldName;
       const cslName = cslNames[zoteroFieldName];
       if (cslName && cslName.length > 0) {
         fieldName = cslName;
       }

      // Type is a special global property that is used to deduce the
      // right name mapping for properties, so it is written above.
      // Just skip it when writing the fields.
      if (zoteroFieldName != "type") {
        csl[fieldName] = transformValue(fieldName, fieldValue);
      }

      // get the item creators
      const itemCreators = creators.get(item.get("key") || "");
      if (itemCreators) {
        // organize by type
        const creatorsByType = new Map<string,CSLName[]>();
        for (const creator of itemCreators) {
          if (creator.creatorType.length > 0 &&
              creator.firstName.length > 0 &&
              creator.lastName.length > 0) {
            if (!creatorsByType.has(creator.creatorType)) {
              creatorsByType.set(creator.creatorType, []);
            }
            creatorsByType.get(creator.creatorType)?.push({
              given: creator.firstName,
              family: creator.lastName
            })
          }
        }

        // set author
        creatorsByType.forEach((creators, zoteroCreatorType) => {
          // Creators need to be mapped to the appropriate
          // CSL property. Most just pass through, but there are
          // some special cases.
          //
          // The following CSL creator types have no corresponding
          // Zotero fields and so should never be emitted:
          //     editorial-director
          //     illustrator
          //     original-author
          const fieldName = cslNames[zoteroCreatorType] || zoteroCreatorType;
          csl[fieldName] = creators;
        });
      }
    });

    // resolve cheater keys
    resolveCslJsonCheaterKeys(csl);
 
    // return csl
    return csl;
  } else {
    return null;
  }
}

function transformValue(cslFieldName: string, value: string) {
  if (isDateValue(cslFieldName)) {

    // The form of the string is 0-3 numbers that represent
    // year-month-day
    // followed by a space and then an optional raw value like
    // yyyy/mm/dd

    // Split the date string at the space. The left half is the formatted date
    // the right half is the raw date string. The left half will always be there
    // the right 'raw' form is optional
    const date : CSLDate = {};
    const spacePos = value.indexOf(' ');
    const parts = value.substring(0, spacePos !== -1 ? spacePos : undefined);
    let raw = "";
    
    // If the left 'dateParts' doesn't represent the whole string, then there
    // is also a raw value. Split the string and capture the right side value
    // and save that as the raw value
    if (parts.length < value.length) {
      const rawPosition = value.indexOf(' ');
      if (rawPosition !== -1) {
        raw = value.substring(rawPosition+1);
        date.raw = raw;
      }
    }

    // Separate the date parts into their component year, month, and day parts
    // CSL dates are represented as an array of ints representing the
    // [year, month, day]
    // and CSL Date values on CSL object are arrays of these CSL dates (so
    // [[year, month, day]]
    if (parts.length > 0) {
      const dateParts: string[] = parts.split("-");
      if (dateParts.length === 3) {

        // While the source data should always be include a year, month, and day,
        // the CSL output format will accept an array with 1 or more elements
        // meaning either a year, and year and month, or a year month and day.
        // This isn't entirely clear from the spec, but looking at other implementations
        // of CSL date handling (for example https://citation.js.org/api/get_date.js.html)
        // + experience data in the wild from sources like CrossRef make this clear.
        const dateArray: [number, (number | undefined)?, (number | undefined)?] 
          = [parseInt(dateParts[0]) || 0];
        
        const month = parseInt(dateParts[1]) || 0;
        if (month) {
          dateArray.push(month);
        }
        const day = parseInt(dateParts[2]) || 0;
        if (day) {
          dateArray.push(day);
        }
        date["date-parts"] = [dateArray];
      }
    }
  
    return date;

  } else if (cslFieldName === "collectionKeys") {
    return collectionKeysToArray(value);
  } else {
    return value;
  }
}

function collectionKeysToArray(collectionKeys: string) {
  return collectionKeys.split(",").filter(key => key.length > 0);
}

function isDateValue(cslFieldName: string) {
  return [
    "accessed",
    "container",
    "event-date",
    "issued",
    "original-date",
    "submitted"
  ].includes(cslFieldName);
}


function getCollectionVersion(db: Database, spec: ZoteroCollectionSpec) {

  let version = 0;

  try {
    const sql = spec.parentKey.length > 0
    ? `
      SELECT
          IFNULL(strftime('%s', MAX(MAX(items.clientDateModified), MAX(collections.clientDateModified))), '0') AS version
      FROM
          collections
          left join collectionItems on collections.collectionID = collectionItems.collectionID
          left join items on collectionItems.itemID = items.itemID
          left join itemTypes on items.itemTypeID = itemTypes.itemTypeID
          left join collections as parentCollections on collections.parentCollectionID = parentCollections.collectionID
      WHERE
          collections.collectionID = ${spec.key}`
    : `
      SELECT
          IFNULL(strftime('%s', MAX(MAX(items.clientDateModified), MAX(collections.clientDateModified))), '0') AS version
      FROM
          libraries
          left join items on libraries.libraryID = items.libraryID
          left join collections on libraries.libraryID = collections.libraryID
          join itemTypes on items.itemTypeID = itemTypes.itemTypeID
          left join deletedItems on items.itemId = deletedItems.itemID
      WHERE
          libraries.libraryID = ${spec.key}
      AND
          itemTypes.typeName <> 'attachment'
      AND
          itemTypes.typeName <> 'note'
      AND
          deletedItems.dateDeleted IS NULL`;

    const r = db.all(sql) as Array<{ version: string }>;
    version = parseInt(r?.[0].version) || 0;

  } catch(error) {
    console.error(error);
  }
  
  return version;
}

function getCollections(db: Database, librariesOnly = false) : ZoteroCollectionSpec[] {

  const librariesSql = `
    SELECT
        CAST(libraries.libraryID as text) as collectionKey,
        IFNULL(groups.name, 'My Library') as collectionName,
        NULL as parentCollectionKey,
        IFNULL(strftime('%s', MAX(MAX(items.clientDateModified), MAX(collections.clientDateModified))), '0') AS version,
        libraries.version as dbVersion
    FROM
        libraries
        left join items on libraries.libraryID = items.libraryID
        left join collections on libraries.libraryID = collections.libraryID
        join itemTypes on items.itemTypeID = itemTypes.itemTypeID
        left join deletedItems on items.itemId = deletedItems.itemID
        left join groups as groups on libraries.libraryID = groups.libraryID
    WHERE
        libraries.type in ('user', 'group')
    AND
        itemTypes.typeName <> 'attachment'
    AND
        itemTypes.typeName <> 'note'
    AND
        deletedItems.dateDeleted IS NULL
    GROUP
        BY libraries.libraryID
  `.trim();

  const collectionsSql = `
    SELECT
        collections.key as collectionKey,
        collections.collectionName as collectionName,
        IFNULL(parentCollections.key, libraries.libraryId) as parentCollectionKey,
        IFNULL(strftime('%s', MAX(MAX(items.clientDateModified), MAX(collections.clientDateModified))), '0') AS version,
        collections.version as dbVersion
    FROM
        collections
        join libraries on libraries.libraryID = collections.libraryID
        left join collectionItems on collections.collectionID = collectionItems.collectionID
        left join items on collectionItems.itemID = items.itemID
        left join itemTypes on items.itemTypeID = itemTypes.itemTypeID
        left join collections as parentCollections on collections.parentCollectionID = parentCollections.collectionID
        left join groups as groups on libraries.libraryID = groups.libraryID
    GROUP BY
        collections.key
  `.trim();

  // If this is libraries only, just read the libraries, otherwise union the library and collection SQL
  const sql = librariesOnly ? librariesSql : `${librariesSql} UNION ${collectionsSql}`;
  return (db.all(sql) as Array<Record<string,string>>).map(row => {
    const version = parseFloat(row["version"]) || parseFloat(row["dbVersion"]) || 0;
    return {
      name: String(row["collectionName"]),
      version,
      key: String(row["collectionKey"] || "-1"),
      parentKey: String(row["parentCollectionKey"] || "")
    }
  });  
}

function creatorsSQL(spec: ZoteroCollectionSpec): [string, Record<string, string>]
{
  const itemsJoin = spec.parentKey.length > 0 
    ? `join collectionItems on items.itemID = collectionItems.itemID
       join collections on collectionItems.collectionID = collections.collectionID` 
    : "";

  const keyWhere = spec.parentKey.length > 0
    ? `AND collections.key = :k`
    : `AND libraries.libraryID = :k`;

  const sql = `
    SELECT
      items.key as key,
      strftime('%s', items.clientDateModified) AS version,
      creators.firstName as firstName,
      creators.LastName as lastName,
      itemCreators.orderIndex,
      creatorTypes.creatorType as creatorType
    FROM
      items
      join itemTypes on items.itemTypeID = itemTypes.itemTypeID
      join libraries on items.libraryID = libraries.libraryID
      ${itemsJoin}
      join itemCreators on items.itemID = itemCreators.itemID
      join creators on creators.creatorID = itemCreators.creatorID
      join creatorTypes on itemCreators.creatorTypeID = creatorTypes.creatorTypeID
      left join deletedItems on items.itemId = deletedItems.itemID
    WHERE
      itemTypes.typeName <> 'attachment'
      AND itemTypes.typeName <> 'note'
      AND deletedItems.dateDeleted IS NULL
      ${keyWhere}
    ORDER BY
      items.key ASC,
      itemCreators.orderIndex
  `;

  return [sql, { ":k": spec.key }];
}

function collectionSQL(spec: ZoteroCollectionSpec): [string, Record<string, string>] {

  const from = spec.parentKey.length > 0 
    ? `join collectionItems on items.itemID = collectionItems.itemID
       join collections on collectionItems.collectionID = collections.collectionID`
    : "";

  const where = spec.parentKey.length > 0
    ? `AND collections.key = :k'`
    : `AND libraries.libraryID = :k`;

  const sql = `
    SELECT
        items.key as key,
        fields.fieldName as name,
        itemDataValues.value as value,
        itemTypeFields.orderIndex as fieldOrder
    FROM
        items
        join libraries on items.libraryID = libraries.libraryID
        ${from}
        join itemTypes on items.itemTypeID = itemTypes.itemTypeID
        join itemData on items.itemID = itemData.itemID
        join itemDataValues on itemData.valueID = itemDataValues.valueID
        join fields on itemData.fieldID = fields.fieldID
        join itemTypeFields on (itemTypes.itemTypeID = itemTypeFields.itemTypeID
          AND fields.fieldID = itemTypeFields.fieldID)
        left join deletedItems on items.itemId = deletedItems.itemID
    WHERE
        itemTypes.typeName <> 'attachment'
        AND itemTypes.typeName <> 'note'
        AND deletedItems.dateDeleted IS NULL
        ${where}
  UNION
    SELECT
        items.key as key,
        'type' as name,
        itemTypes.typeName as  value,
        0 as fieldOrder
    FROM
        items
        join itemTypes on items.itemTypeID = itemTypes.itemTypeID
        join libraries on items.libraryID = libraries.libraryID
        left join deletedItems on items.itemId = deletedItems.itemID
        ${from}
    WHERE
        itemTypes.typeName <> 'attachment'
        AND itemTypes.typeName <> 'note'
        AND deletedItems.dateDeleted IS NULL
        ${where}
  UNION
    SELECT
        items.key as key,
        'libraryID' as name,
        CAST(items.libraryID as text) as value,
        500 as fieldOrder
    FROM
        items
        join itemTypes on items.itemTypeID = itemTypes.itemTypeID
        join libraries on items.libraryID = libraries.libraryID
        left join deletedItems on items.itemId = deletedItems.itemID
        ${from}
    WHERE
        itemTypes.typeName <> 'attachment'
        AND itemTypes.typeName <> 'note'
        AND deletedItems.dateDeleted IS NULL
        ${where}
  UNION
    SELECT
        items.key as key,
        'collectionKeys' as name,
        libraries.libraryID || ',' || IFNULL(group_concat(collections.key), '') as value,
        10000 as fieldOrder
    FROM
        items
        join itemTypes on items.itemTypeID = itemTypes.itemTypeID
        left join collectionItems on items.itemID = collectionItems.itemID
        left join collections on collectionItems.collectionID = collections.collectionID
        join libraries on items.libraryID = libraries.libraryID
        left join deletedItems on items.itemId = deletedItems.itemID
    WHERE
        itemTypes.typeName <> 'attachment'
        AND itemTypes.typeName <> 'note'
        AND deletedItems.dateDeleted IS NULL
        ${where}
    GROUP BY items.key
  ORDER BY
    key ASC,
    fieldOrder ASC 
  `;

   return [sql, { ":k": spec.key }];
}


// Return a CSL type for a given zoteroType
// The type mappings were derived from the mappings here:
// https://aurimasv.github.io/z2csl/typeMap.xml
function cslType(zoteroType: string) {
  if (zoteroType === "artwork") {
     return "graphic";
  } else if (zoteroType === "attachment") {
     return "article";
  } else if (zoteroType === "audioRecording") {
     return "song";
  } else if (zoteroType === "bill") {
     return "bill";
  } else if (zoteroType === "blogPost") {
     return "post-weblog";
  } else if (zoteroType === "book") {
     return "book";
  } else if (zoteroType === "bookSection") {
     return "chapter";
  } else if (zoteroType === "case") {
     return "legal_case";
  } else if (zoteroType === "computerProgram") {
     return "book";
  } else if (zoteroType === "conferencePaper") {
     return "paper-conference";
  } else if (zoteroType === "dictionaryEntry") {
     return "entry-dictionary";
  } else if (zoteroType === "document") {
     return "article";
  } else if (zoteroType === "email") {
     return "personal_communication";
  } else if (zoteroType === "encyclopediaArticle") {
     return "entry-encyclopedia";
  } else if (zoteroType === "film") {
     return "motion_picture";
  } else if (zoteroType === "forumPost") {
     return "post";
  } else if (zoteroType === "hearing") {
     return "bill";
  } else if (zoteroType === "instantMessage") {
     return "personal_communication";
  } else if (zoteroType === "interview") {
     return "interview";
  } else if (zoteroType === "journalArticle") {
     return "article-journal";
  } else if (zoteroType === "letter") {
     return "personal_communication";
  } else if (zoteroType === "magazineArticle") {
     return "article-magazine";
  } else if (zoteroType === "manuscript") {
     return "manuscript";
  } else if (zoteroType === "map") {
     return "map";
  } else if (zoteroType === "newspaperArticle") {
     return "article-newspaper";
  } else if (zoteroType === "note") {
     return "article";
  } else if (zoteroType === "patent") {
     return "patent";
  } else if (zoteroType === "podcast") {
     return "song";
  } else if (zoteroType === "presentation") {
     return "speech";
  } else if (zoteroType === "radioBroadcast") {
     return "broadcast";
  } else if (zoteroType === "report") {
     return "report";
  } else if (zoteroType === "statute") {
     return "legislation";
  } else if (zoteroType === "thesis") {
     return "thesis";
  } else if (zoteroType === "tvBroadcast") {
     return "broadcast";
  } else if (zoteroType === "videoRecording") {
     return "motion_picture";
  } else if (zoteroType === "webpage") {
     return "webpage";
  } else {
     return zoteroType;
  }
}

// Provides a map that contains zotero field names and their corresponding
// csl fields names for a given zotero type.
// The field mappings were generated from the explanation provided by Zotero at:
// https://aurimasv.github.io/z2csl/typeMap.xml#map-artwork
function cslFieldNames(zoteroType: string) : Record<string,string>
{
  const transforms: Record<string,string> = {};
  
   // Per zotero type transformations
   if (zoteroType === "artwork")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["artworkMedium"] = "medium";
      transforms["artworkSize"] = "dimensions";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["artist"] = "author";
      // contributor not representable in Zotero
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "audioRecording")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["audioRecordingFormat"] = "medium";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["composer"] = "composer";
      // contributor not representable in Zotero
      transforms["performer"] = "author";
      // wordsBy not representable in Zotero
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["ISBN"] = "ISBN";
      transforms["label"] = "publisher";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["numberOfVolumes"] = "number-of-volumes";
      transforms["place"] = "publisher-place";
      // rights not representable in Zotero
      transforms["runningTime"] = "dimensions";
      transforms["seriesTitle"] = "collection-title";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["volume"] = "volume";
   }
   else if (zoteroType === "bill")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["billNumber"] = "number";
      transforms["code"] = "container-title";
      transforms["codePages"] = "page";
      transforms["codeVolume"] = "volume";
      // creator not representable in Zotero
      // contributor not representable in Zotero
      // cosponsor not representable in Zotero
      transforms["sponsor"] = "author";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["history"] = "references";
      transforms["language"] = "language";
      transforms["legislativeBody"] = "authority";
      // rights not representable in Zotero
      transforms["section"] = "section";
      transforms["session"] = "chapter-number";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }

   else if (zoteroType === "blogPost")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["blogTitle"] = "container-title";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // commenter not representable in Zotero
      // contributor not representable in Zotero
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["websiteType"] = "genre";
   }
   else if (zoteroType === "book")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["editor"] = "editor";
      transforms["seriesEditor"] = "collection-editor";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["edition"] = "edition";
      transforms["extra"] = "note";
      transforms["ISBN"] = "ISBN";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["numberOfVolumes"] = "number-of-volumes";
      transforms["numPages"] = "number-of-pages";
      transforms["place"] = "publisher-place";
      transforms["publisher"] = "publisher";
      // rights not representable in Zotero
      transforms["series"] = "collection-title";
      transforms["seriesNumber"] = "collection-number";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["volume"] = "volume";
   }
   else if (zoteroType === "bookSection")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["bookTitle"] = "container-title";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      transforms["bookAuthor"] = "container-author";
      // contributor not representable in Zotero
      transforms["editor"] = "editor";
      transforms["seriesEditor"] = "collection-editor";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["edition"] = "edition";
      transforms["extra"] = "note";
      transforms["ISBN"] = "ISBN";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["numberOfVolumes"] = "number-of-volumes";
      transforms["pages"] = "page";
      transforms["place"] = "publisher-place";
      transforms["publisher"] = "publisher";
      // rights not representable in Zotero
      transforms["series"] = "collection-title";
      transforms["seriesNumber"] = "collection-number";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["volume"] = "volume";
   }
   else if (zoteroType === "case")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["caseName"] = "title";
      transforms["court"] = "authority";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      // counsel not representable in Zotero
      transforms["dateDecided"] = "issued";
      transforms["docketNumber"] = "number";
      transforms["extra"] = "note";
      transforms["firstPage"] = "page";
      transforms["history"] = "references";
      transforms["language"] = "language";
      transforms["reporter"] = "container-title";
      transforms["reporterVolume"] = "volume";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "computerProgram")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      transforms["company"] = "publisher";
      // creator not representable in Zotero
      // contributor not representable in Zotero
      transforms["programmer"] = "author";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["ISBN"] = "ISBN";
      transforms["libraryCatalog"] = "source";
      transforms["place"] = "publisher-place";
      transforms["programmingLanguage"] = "genre";
      // rights not representable in Zotero
      transforms["seriesTitle"] = "collection-title";
      transforms["shortTitle"] = "title-short";
      transforms["system"] = "medium";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["version"] = "version";
   }
   else if (zoteroType === "conferencePaper")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      transforms["conferenceName"] = "event";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["editor"] = "editor";
      transforms["seriesEditor"] = "collection-editor";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["DOI"] = "DOI";
      transforms["extra"] = "note";
      transforms["ISBN"] = "ISBN";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["pages"] = "page";
      transforms["place"] = "publisher-place";
      transforms["proceedingsTitle"] = "container-title";
      transforms["publisher"] = "publisher";
      // rights not representable in Zotero
      transforms["series"] = "collection-title";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["volume"] = "volume";
   }
   else if (zoteroType === "dictionaryEntry")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["editor"] = "editor";
      transforms["seriesEditor"] = "collection-editor";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["dictionaryTitle"] = "container-title";
      transforms["edition"] = "edition";
      transforms["extra"] = "note";
      transforms["ISBN"] = "ISBN";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["numberOfVolumes"] = "number-of-volumes";
      transforms["pages"] = "page";
      transforms["place"] = "publisher-place";
      transforms["publisher"] = "publisher";
      // rights not representable in Zotero
      transforms["series"] = "collection-title";
      transforms["seriesNumber"] = "collection-number";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["volume"] = "volume";
   }
   else if (zoteroType === "document")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["editor"] = "editor";
      transforms["reviewedAuthor"] = "reviewed-author";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["publisher"] = "publisher";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "email")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["recipient"] = "recipient";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["subject"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "encyclopediaArticle")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["editor"] = "editor";
      transforms["seriesEditor"] = "collection-editor";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["edition"] = "edition";
      transforms["encyclopediaTitle"] = "container-title";
      transforms["extra"] = "note";
      transforms["ISBN"] = "ISBN";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["numberOfVolumes"] = "number-of-volumes";
      transforms["pages"] = "page";
      transforms["place"] = "publisher-place";
      transforms["publisher"] = "publisher";
      // rights not representable in Zotero
      transforms["series"] = "collection-title";
      transforms["seriesNumber"] = "collection-number";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["volume"] = "volume";
   }
   else if (zoteroType === "film")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      // contributor not representable in Zotero
      transforms["director"] = "author";
      // producer not representable in Zotero
      // scriptwriter not representable in Zotero
      transforms["date"] = "issued";
      transforms["distributor"] = "publisher";
      transforms["extra"] = "note";
      transforms["genre"] = "genre";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      // rights not representable in Zotero
      transforms["runningTime"] = "dimensions";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["videoRecordingFormat"] = "medium";
   }
   else if (zoteroType === "forumPost")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["forumTitle"] = "container-title";
      transforms["language"] = "language";
      transforms["postType"] = "genre";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "hearing")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["committee"] = "section";
      // creator not representable in Zotero
      transforms["contributor"] = "author";
      transforms["date"] = "issued";
      transforms["documentNumber"] = "number";
      transforms["extra"] = "note";
      transforms["history"] = "references";
      transforms["language"] = "language";
      transforms["legislativeBody"] = "authority";
      transforms["numberOfVolumes"] = "number-of-volumes";
      transforms["pages"] = "page";
      transforms["place"] = "publisher-place";
      transforms["publisher"] = "publisher";
      // rights not representable in Zotero
      transforms["session"] = "chapter-number";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "instantMessage")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["recipient"] = "recipient";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "interview")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      // contributor not representable in Zotero
      transforms["interviewee"] = "author";
      transforms["interviewer"] = "interviewer";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["interviewMedium"] = "medium";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "journalArticle")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["editor"] = "editor";
      transforms["reviewedAuthor"] = "reviewed-author";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["DOI"] = "DOI";
      transforms["extra"] = "note";
      transforms["ISSN"] = "ISSN";
      transforms["issue"] = "issue";
      transforms["journalAbbreviation"] = "container-title-short";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["pages"] = "page";
      transforms["publicationTitle"] = "container-title";
      // rights not representable in Zotero
      transforms["series"] = "collection-title";
      // seriesText not representable in Zotero
      transforms["seriesTitle"] = "collection-title";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["volume"] = "volume";
   }
   else if (zoteroType === "letter")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["recipient"] = "recipient";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      transforms["letterType"] = "genre";
      transforms["libraryCatalog"] = "source";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "magazineArticle")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["reviewedAuthor"] = "reviewed-author";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["ISSN"] = "ISSN";
      transforms["issue"] = "issue";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["pages"] = "page";
      transforms["publicationTitle"] = "container-title";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["volume"] = "volume";
   }
   else if (zoteroType === "manuscript")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["manuscriptType"] = "genre";
      transforms["numPages"] = "number-of-pages";
      transforms["place"] = "publisher-place";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "map")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["cartographer"] = "author";
      // contributor not representable in Zotero
      transforms["seriesEditor"] = "collection-editor";
      transforms["date"] = "issued";
      transforms["edition"] = "edition";
      transforms["extra"] = "note";
      transforms["ISBN"] = "ISBN";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["mapType"] = "genre";
      transforms["place"] = "publisher-place";
      transforms["publisher"] = "publisher";
      // rights not representable in Zotero
      transforms["scale"] = "scale";
      transforms["seriesTitle"] = "collection-title";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "newspaperArticle")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["reviewedAuthor"] = "reviewed-author";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["edition"] = "edition";
      transforms["extra"] = "note";
      transforms["ISSN"] = "ISSN";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["pages"] = "page";
      transforms["place"] = "publisher-place";
      transforms["publicationTitle"] = "container-title";
      // rights not representable in Zotero
      transforms["section"] = "section";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "patent")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["applicationNumber"] = "call-number";
      // assignee not representable in Zotero
      // country not representable in Zotero
      // creator not representable in Zotero
      // attorneyAgent not representable in Zotero
      // contributor not representable in Zotero
      transforms["inventor"] = "author";
      transforms["extra"] = "note";
      transforms["filingDate"] = "submitted";
      transforms["issueDate"] = "issued";
      transforms["issuingAuthority"] = "authority";
      transforms["language"] = "language";
      transforms["legalStatus"] = "status";
      transforms["pages"] = "page";
      transforms["patentNumber"] = "number";
      transforms["place"] = "publisher-place";
      transforms["priorityNumbers"] = "issue";
      transforms["references"] = "references";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "podcast")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["audioFileType"] = "medium";
      // creator not representable in Zotero
      // contributor not representable in Zotero
      // guest not representable in Zotero
      transforms["podcaster"] = "author";
      transforms["episodeNumber"] = "number";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      // rights not representable in Zotero
      transforms["runningTime"] = "dimensions";
      transforms["seriesTitle"] = "collection-title";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "presentation")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      // creator not representable in Zotero
      // contributor not representable in Zotero
      transforms["presenter"] = "author";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      transforms["meetingName"] = "event";
      transforms["place"] = "publisher-place";
      transforms["presentationType"] = "genre";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "radioBroadcast")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["audioRecordingFormat"] = "medium";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      // castMember not representable in Zotero
      // contributor not representable in Zotero
      transforms["director"] = "author";
      // guest not representable in Zotero
      // producer not representable in Zotero
      // scriptwriter not representable in Zotero
      transforms["date"] = "issued";
      transforms["episodeNumber"] = "number";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["network"] = "publisher";
      transforms["place"] = "publisher-place";
      transforms["programTitle"] = "container-title";
      // rights not representable in Zotero
      transforms["runningTime"] = "dimensions";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "report")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["seriesEditor"] = "collection-editor";
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["institution"] = "publisher";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["pages"] = "page";
      transforms["place"] = "publisher-place";
      transforms["reportNumber"] = "number";
      transforms["reportType"] = "genre";
      // rights not representable in Zotero
      transforms["seriesTitle"] = "collection-title";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "statute")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["code"] = "container-title";
      transforms["codeNumber"] = "volume";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["dateEnacted"] = "issued";
      transforms["extra"] = "note";
      transforms["history"] = "references";
      transforms["language"] = "language";
      transforms["nameOfAct"] = "title";
      transforms["pages"] = "page";
      transforms["publicLawNumber"] = "number";
      // rights not representable in Zotero
      transforms["section"] = "section";
      transforms["session"] = "chapter-number";
      transforms["shortTitle"] = "title-short";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "thesis")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["numPages"] = "number-of-pages";
      transforms["place"] = "publisher-place";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["thesisType"] = "genre";
      transforms["title"] = "title";
      transforms["university"] = "publisher";
      transforms["url"] = "URL";
   }
   else if (zoteroType === "tvBroadcast")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      // castMember not representable in Zotero
      // contributor not representable in Zotero
      transforms["director"] = "author";
      // guest not representable in Zotero
      // producer not representable in Zotero
      // scriptwriter not representable in Zotero
      transforms["date"] = "issued";
      transforms["episodeNumber"] = "number";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["network"] = "publisher";
      transforms["place"] = "publisher-place";
      transforms["programTitle"] = "container-title";
      // rights not representable in Zotero
      transforms["runningTime"] = "dimensions";
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["videoRecordingFormat"] = "medium";
   }
   else if (zoteroType === "videoRecording")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      transforms["archive"] = "archive";
      transforms["archiveLocation"] = "archive_location";
      transforms["callNumber"] = "call-number";
      // creator not representable in Zotero
      // castMember not representable in Zotero
      // contributor not representable in Zotero
      transforms["director"] = "author";
      // producer not representable in Zotero
      // scriptwriter not representable in Zotero
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["ISBN"] = "ISBN";
      transforms["language"] = "language";
      transforms["libraryCatalog"] = "source";
      transforms["numberOfVolumes"] = "number-of-volumes";
      transforms["place"] = "publisher-place";
      // rights not representable in Zotero
      transforms["runningTime"] = "dimensions";
      transforms["seriesTitle"] = "collection-title";
      transforms["shortTitle"] = "title-short";
      transforms["studio"] = "publisher";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["videoRecordingFormat"] = "medium";
      transforms["volume"] = "volume";
   }
   else if (zoteroType === "webpage")
   {
      transforms["abstractNote"] = "abstract";
      transforms["accessDate"] = "accessed";
      // creator not representable in Zotero
      transforms["author"] = "author";
      // contributor not representable in Zotero
      transforms["translator"] = "translator";
      transforms["date"] = "issued";
      transforms["extra"] = "note";
      transforms["language"] = "language";
      // rights not representable in Zotero
      transforms["shortTitle"] = "title-short";
      transforms["title"] = "title";
      transforms["url"] = "URL";
      transforms["websiteTitle"] = "container-title";
      transforms["websiteType"] = "genre";
   }
   return transforms;
}