import { Schema } from "prosemirror-model";

export function emptyDoc(schema: Schema) {
  return schema.nodeFromJSON({
    type: 'doc',
    content: [
      { type: 'body', content: [{ type: 'paragraph' }] },
      { type: 'notes', content: [] },
    ],
  });
}
