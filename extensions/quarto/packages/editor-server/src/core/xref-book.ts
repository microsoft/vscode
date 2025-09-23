import { QuartoContext, QuartoProjectConfig } from "quarto-core";
import { EditorServerDocument, EditorServerDocuments, editorDocumentsEqual } from "./documents";
import { XRef } from "editor-types";
import { sourceXRefs, projectXrefIndex, computationalXRefs } from "./xref";



export async function xrefsForBook(
  quartoContext: QuartoContext,
  config: QuartoProjectConfig,
  documents: EditorServerDocuments) : Promise<XRef[]> {

  // get project xref index (rendered)
  // TODO: for single file case try to read only a single index file
  const projectIdx = projectXrefIndex(config.dir);
  
  const xrefs: XRef[] = config.files.input.flatMap(file => {

    const document = documents.getDocument(file);
    const entry = xrefsCache.get(file);
    if (!entry || !document || !editorDocumentsEqual(entry.document, document)) {
      // parse xrefs from source
      const srcXrefs = sourceXRefs(quartoContext, file, documents, config.dir);

      // add computational xrefs
      const xrefs = [
        ...srcXrefs,
        ...computationalXRefs(
           srcXrefs,
           projectIdx,
           file,
           config.dir
        )
      ];

      // populate cache
      xrefsCache.set(file, { document, xrefs });
    }
    // return from cache (existing or just populated)
    return xrefsCache.get(file)?.xrefs || new Array<XRef>();
  })

  return xrefs;
  
}

// cache of xrefs
const xrefsCache = new Map<string, { document: EditorServerDocument, xrefs: XRef[]}>();


