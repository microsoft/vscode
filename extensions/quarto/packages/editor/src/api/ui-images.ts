/*
 * ui-images.ts
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

export interface EditorUIImages {
  copy: string;
  properties: string;
  properties_deco: string;
  properties_deco_dark: string;
  removelink: string;
  runchunk: string;
  runprevchunks: string;
  search: string;
  search_progress: string;
  omni_insert: {
    generic: string;
    heading1: string;
    heading1_dark: string;
    heading2: string;
    heading2_dark: string;
    heading3: string;
    heading3_dark: string;
    heading4: string;
    heading4_dark: string;
    ordered_list: string;
    ordered_list_dark: string;
    bullet_list: string;
    bullet_list_dark: string;
    blockquote: string;
    blockquote_dark: string;
    math_inline: string;
    math_inline_dark: string;
    math_display: string;
    math_display_dark: string;
    html_block: string;
    html_block_dark: string;
    line_block: string;
    line_block_dark: string;
    emoji: string;
    emoji_dark: string;
    comment: string;
    comment_dark: string;
    div: string;
    div_dark: string;
    code_block: string;
    code_block_dark: string;
    footnote: string;
    footnote_dark: string;
    citation: string;
    citation_dark: string;
    cross_reference: string;
    cross_reference_dark: string;
    symbol: string;
    symbol_dark: string;
    table: string;
    table_dark: string;
    definition_list: string;
    definition_list_dark: string;
    horizontal_rule: string;
    horizontal_rule_dark: string;
    image: string;
    image_dark: string;
    link: string;
    link_dark: string;
    paragraph: string;
    paragraph_dark: string;
    raw_block: string;
    raw_block_dark: string;
    raw_inline: string;
    raw_inline_dark: string;
    tex_block: string;
    tex_block_dark: string;
    yaml_block: string;
    yaml_block_dark: string;
    python_chunk: string;
    sql_chunk: string;
    d3_chunk: string;
    stan_chunk: string;
    bash_chunk: string;
    bash_chunk_dark: string;
    r_chunk: string;
    r_chunk_dark: string;
    rcpp_chunk: string;
    rcpp_chunk_dark: string;
    tabset: string;
    tabset_dark: string;
    slide_columns: string;
    slide_columns_dark: string;
    slide_pause: string;
    slide_pause_dark: string;
    slide_notes: string;
    slide_notes_dark: string;
  };
  citations: {
    article: string;
    article_dark: string;
    book: string;
    book_dark: string;
    broadcast: string;
    broadcast_dark: string;
    data: string;
    data_dark: string;
    entry: string;
    entry_dark: string;
    image: string;
    image_dark: string;
    legal: string;
    legal_dark: string;
    map: string;
    map_dark: string;
    movie: string;
    movie_dark: string;
    other: string;
    other_dark: string;
    song: string;
    song_dark: string;
    web: string;
    web_dark: string;
    zoteroOverlay: string;
    local_sources: string;
    packages: string;
    bibligraphy: string;
    bibligraphy_folder: string;
    zotero_library: string;
    zotero_collection: string;
    zotero_root: string;
    doi: string;
    crossref: string;
    pubmed: string;
    datacite: string;
  };
  xrefs: {
    section_dark: string;
    section: string;
    equation: string;
    equation_dark: string;
    table: string;
    table_dark: string;
    listing: string;
    listing_dark: string;
    theorem: string;
    theorem_dark: string;
    figure: string;
    figure_dark: string;
    type_all: string;
    type_section: string;
    type_figure: string;
    type_table: string;
    type_listing: string;
    type_equation: string;
    type_theorem: string;
  };
  widgets: {
    tag_delete: string;
    tag_edit: string;
  };
}
