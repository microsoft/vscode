#!/bin/bash

# Fix Tokenizer class
if [ -f "core/Tokenizer.ts" ]; then
    sed -i '' '/^export default class Tokenizer {$/a\
    private RESERVED_WORDS: string[];\
    private RESERVED_TOPLEVEL_WORDS: string[];\
    private RESERVED_NEWLINE_WORDS: string[];\
    private OPERATOR_WORDS: string[];\
    private WORD_OPERATORS: string[];\
    private STRING_REGEX: RegExp;\
    private OPERATOR_REGEX: RegExp;\
    private BLOCK_COMMENT_REGEX: RegExp;\
    private LINE_COMMENT_REGEX: RegExp;\
    private RESERVED_TOPLEVEL_REGEX: RegExp;\
    private RESERVED_NEWLINE_REGEX: RegExp;\
    private RESERVED_PLAIN_REGEX: RegExp;\
    private WORD_OPERATOR_REGEX: RegExp;\
    private NUMBER_REGEX: RegExp;\
    private BOUNDARY_REGEX: RegExp;\
\
' core/Tokenizer.ts
    
    # Fix constructor parameters
    sed -i '' 's/constructor(cfg)/constructor(cfg: any)/' core/Tokenizer.ts
fi

# Fix PlSqlFormatter class
if [ -f "languages/PlSqlFormatter.ts" ]; then
    sed -i '' '/^export default class PlSqlFormatter {$/a\
    private cfg: any;\
\
' languages/PlSqlFormatter.ts
    
    # Fix constructor parameters
    sed -i '' 's/constructor(cfg = {})/constructor(cfg: any = {})/' languages/PlSqlFormatter.ts
fi

# Fix StandardSqlFormatter class
if [ -f "languages/StandardSqlFormatter.ts" ]; then
    sed -i '' '/^export default class StandardSqlFormatter {$/a\
    private cfg: any;\
\
' languages/StandardSqlFormatter.ts
    
    # Fix constructor parameters
    sed -i '' 's/constructor(cfg = {})/constructor(cfg: any = {})/' languages/StandardSqlFormatter.ts
fi

