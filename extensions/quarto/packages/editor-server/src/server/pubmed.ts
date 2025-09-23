/*
 * pubmed.ts
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

import fetch from "cross-fetch";

import { JsonRpcServerMethod } from "core";
import { kPubMedSearch, kStatusOK, PubMedDocument, PubMedResult, PubMedServer } from "editor-types";

import { handleResponseWithStatus } from "./response";

 const kPubMedEUtilsHost = "https://eutils.ncbi.nlm.nih.gov";
 const kPubMedESearch = "entrez/eutils/esearch.fcgi";
 const kPubMedESummary = "entrez/eutils/esummary.fcgi";


export interface PubMedServerOptions {
  tool: string;
  email: string;
  api_key?: string;
}

export function pubMedServer(options: PubMedServerOptions) : PubMedServer {
  return {
    async search(query: string) : Promise<PubMedResult> {  

      // build pubmed params w/ additional required fields 
      const pubMedParams = (params: Record<string,unknown>) => {
        return new URLSearchParams({
          ...options,
          retmode: "json",
          ...params 
        })
      }
     
      // excute search
      const searchUrl = `${kPubMedEUtilsHost}/${kPubMedESearch}?` + pubMedParams({ 
        db: "pubmed",
        term: query,
        sort: "relevance",
        retmax: "25"  
      });
      const result = await handleResponseWithStatus<ESearchResult>(() => fetch(searchUrl))
      // search succeeded!
      if (result.status === kStatusOK) {
        if (result.message && result.message.esearchresult.idlist.length > 0) {
          // retreive docs
          const docsUrl = `${kPubMedEUtilsHost}/${kPubMedESummary}?` + pubMedParams({ 
            db: "pubmed",
            id: result.message.esearchresult.idlist.join(","), 
          });
          const docsResult = await handleResponseWithStatus<ESummaryResult>(() => fetch(docsUrl));
          if (docsResult.status === kStatusOK) {
            const docs: PubMedDocument[] = [];
            const uids = docsResult.message?.result.uids;
            if (uids) {
              for (const uid of uids) {
                const summary = docsResult.message?.result[uid] as ESummary | undefined;
                if (summary) {
                  const doc = eSummaryToPubMedDocument(summary);
                  if (doc) {
                    docs.push(doc);
                  }
                }
              }
            }
            return { ...docsResult, message: docs };
          // error retreiving docs
          } else {
            return { ...result, message: null };
          }

        // no matching ids found
        } else {
          return { ...result, message: [] };
        }
      // error executing search
      } else {
        return { ...result, message: null };
      }


    }
  }
}

export function pubMedServerMethods(options: PubMedServerOptions) : Record<string, JsonRpcServerMethod> {
  const server = pubMedServer(options);
  const methods: Record<string, JsonRpcServerMethod> = {
    [kPubMedSearch]: args => server.search(args[0])
  }
  return methods;
}


interface ESearchResult {
  esearchresult: {
    idlist: string[];
  }
}

interface ESummaryResult {
  "result": {
    uids: string[];
    [key: string]: ESummary | unknown;
  }
}

interface ESummary {
  articleids?: Array<{ idtype: string; value: string}>;
  pubtype?: string[];
  authors?: Array<{ name?: string }>;
  sortfirstauthor?: string;
  title?: string;
  source?: string;
  volume?: string;
  issue?: string;
  pubdate?: string;
}


function eSummaryToPubMedDocument(summary: ESummary) : PubMedDocument | null {
  // find the doi (bail if we can't)
  const doi = summary.articleids?.find(article => 
    article.idtype === "doi"
  )?.value;
  if (!doi)
    return null;

  // create doc
  const doc: PubMedDocument = { doi };
  doc.pubTypes = summary.pubtype;
  doc.authors = summary.authors?.map(author => author.name)
    .filter(author => !!author) as string[] | undefined;
  doc.sortFirstAuthor = summary.sortfirstauthor;
  doc.title = summary.title;
  doc.source = summary.source;
  doc.volume = summary.volume;
  doc.issue = summary.issue;
  doc.pubDate = summary.pubdate;
  return doc;
}

