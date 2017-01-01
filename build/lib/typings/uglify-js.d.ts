// Type definitions for UglifyJS 2 v2.6.1
// Project: https://github.com/mishoo/UglifyJS2
// Definitions by: Tanguy Krotoff <https://github.com/tkrotoff>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module 'uglify-js' {
  import * as MOZ_SourceMap from 'source-map';

  namespace UglifyJS {
    interface Tokenizer {
      /**
       * The type of this token.
       * Can be "num", "string", "regexp", "operator", "punc", "atom", "name", "keyword", "comment1" or "comment2".
       * "comment1" and "comment2" are for single-line, respectively multi-line comments.
       */
      type: string;

      /**
       * The name of the file where this token originated from. Useful when compressing multiple files at once to generate the proper source map.
       */
      file: string;

      /**
       * The "value" of the token.
       * That's additional information and depends on the token type: "num", "string" and "regexp" tokens you get their literal value.
       * - For "operator" you get the operator.
       * - For "punc" it's the punctuation sign (parens, comma, semicolon etc).
       * - For "atom", "name" and "keyword" it's the name of the identifier
       * - For comments it's the body of the comment (excluding the initial "//" and "/*".
       */
      value: string;

      /**
       * The line number of this token in the original code.
       * 1-based index.
       */
      line: number;

      /**
       * The column number of this token in the original code.
       * 0-based index.
       */
      col: number;

      /**
       * Short for "newline before", it's a boolean that tells us whether there was a newline before this node in the original source. It helps for automatic semicolon insertion.
       * For multi-line comments in particular this will be set to true if there either was a newline before this comment, or * * if this comment contains a newline.
       */
      nlb: boolean;

      /**
       * This doesn't apply for comment tokens, but for all other token types it will be an array of comment tokens that were found before.
       */
      comments_before: string[];
    }

    interface AST_Node {
      // The first token of this node
      start: AST_Node;

      // The last token of this node
      end: AST_Node;

      transform(tt: TreeTransformer): AST_Toplevel;
    }

    interface AST_Toplevel extends AST_Node {
      // UglifyJS contains a scope analyzer which figures out variable/function definitions, references etc.
      // You need to call it manually before compression or mangling.
      // The figure_out_scope method is defined only on the AST_Toplevel node.
      figure_out_scope(): void;

      // Get names that are optimized for GZip compression (names will be generated using the most frequent characters first)
      compute_char_frequency(): void;

      mangle_names(): void;

      print(stream: OutputStream): void;

      print_to_string(options?: BeautifierOptions): string;
    }

    interface MinifyOptions {
      spidermonkey?: boolean;
      outSourceMap?: string;
      sourceRoot?: string;
      inSourceMap?: string;
      fromString?: boolean;
      warnings?: boolean;
      mangle?: Object;
      output?: MinifyOutput,
      compress?: Object;
    }

    interface MinifyOutput {
      code: string;
      map: string;
    }

    function minify(files: string | Array<string>, options?: MinifyOptions): MinifyOutput;


    interface ParseOptions {
      // Default is false
      strict?: boolean;

      // Input file name, default is null
      filename?: string;

      // Default is null
      toplevel?: AST_Toplevel;
    }

    /**
     * The parser creates a custom abstract syntax tree given a piece of JavaScript code.
     * Perhaps you should read about the AST first.
     */
    function parse(code: string, options?: ParseOptions): AST_Toplevel;


    interface BeautifierOptions {
      /**
       * Start indentation on every line (only when `beautify`)
       */
      indent_start?: number;

      /**
       * Indentation level (only when `beautify`)
       */
      indent_level?: number;

      /**
       * Quote all keys in object literals?
       */
      quote_keys?: boolean;

      /**
       * Add a space after colon signs?
       */
      space_colon?: boolean;

      /**
       * Output ASCII-safe? (encodes Unicode characters as ASCII)
       */
      ascii_only?: boolean;

      /**
       * Escape "</script"?
       */
      inline_script?: boolean;

      /**
       * Informative maximum line width (for beautified output)
       */
      width?: number;

      /**
       * Maximum line length (for non-beautified output)
       */
      max_line_len?: number;

      /**
       * Output IE-safe code?
       */
      ie_proof?: boolean;

      /**
       * Beautify output?
       */
      beautify?: boolean;

      /**
       * Output a source map
       */
      source_map?: SourceMapOptions;

      /**
       * Use brackets every time?
       */
      bracketize?: boolean;

      /**
       * Output comments?
       */
      comments?: boolean;

      /**
       * Use semicolons to separate statements? (otherwise, newlines)
       */
      semicolons?: boolean;
    }

    interface OutputStream {
      // Return the output so far as a string
      get(): string;
      toString(): string;

      // Insert one indentation string (usually 4 characters).
      // Optionally pass true to indent half the width (I'm using that for case and default lines in switch blocks.
      // If beautify is off, this function does nothing.
      indent(half?: boolean): void;

      // Return the current indentation width (not level; for example if we're in level 2 and indent_level is 4, this method would return 8.
      indentation(): number;

      // return the width of the current line text minus indentation.
      current_width(): number

      // Return true if current_width() is bigger than options.width (assuming options.width is non-null, non-zero).
      should_break(): boolean;

      // If beautification is on, this inserts a newline. Otherwise it does nothing.
      newline(): void;

      // Include the given string into the output, adjusting current_line, current_col and current_pos accordingly.
      print(str: string): void;

      // If beautification is on this always includes a space character.
      // Otherwise it saves a hint somewhere that a space might be needed at current point.
      // The space will go in at the next output but only when absolutely required, for example it will insert the space in return 10 but not in return"stuff".
      space(): void;

      // Inserts a comma, and calls space() — that is, if beautification is on you'll get a space after the comma.
      comma(): void;

      // Inserts a colon, and calls space() if options.space_colon is set.
      colon(): void;

      // Returns the last printed chunk.
      last(): string;

      // If beautification is on it always inserts a semicolon.
      // Otherwise it saves a hint that a semicolon might be needed at current point.
      // The semicolon is inserted when the next output comes in, only if required to not break the JS syntax.
      semicolon(): void;

      // Always inserts a semicolon and clears the hint that a semicolon might be needed.
      force_semicolon(): void;

      // Encodes any non-ASCII characters in string with JavaScript's conventions (using \uCODE).
      to_ascii(str: string): void;

      // Prints an identifier. If options.ascii_only is set, non-ASCII chars will be encoded with JavaScript conventions.
      print_name(name: string): void;

      // Prints a string. It adds quotes automatically.
      // It prefers double-quotes, but will actually count any quotes in the string and will use single-quotes if the output proves to be shorter (depending on how many backslashes it has to insert).
      // It encodes to ASCII if options.ascii_only is set.
      print_string(str: string): void;

      // Returns the width of the next indentation level. For example if current level is 2 and options.indent_level is 4, it'll return 12.
      next_indent(): number;

      // Sets the current indentation to col (column), calls the function and thereafter restores the previous indentation level.
      // If beautification is off it simply calls func.
      with_indent(col: number, func: Function): void;

      // This is used to output blocks in curly brackets.
      // It'll print an open bracket at current point, then call newline() and with the next indentation level it calls your func.
      // Lastly, it'll print an indented closing bracket. As usual, if beautification is off you'll just get {x} where x is whatever func outputs.
      with_block(func: Function): void;

      // Adds parens around the output that your function prints.
      with_parens(func: Function): void;

      // Adds square brackets around the output that your function prints.
      with_square(func: Function): void;

      // If options.source_map is set, this will generate a source mapping between the given token (which should be an AST_Token-like object) and the current line/col.
      // The name is optional; in most cases it will be inferred from the token.
      add_mapping(token: AST_Node, name?: string): void;

      // Returns the option with the given name.
      option(name: string): any;

      // Returns the current line in the output (1-based).
      line(): number;

      // Returns the current column in the output (zero-based).
      col(): number;

      // Push the given node into an internal stack. This is used to keep track of current node's parent(s).
      push_node(node: AST_Node): void;

      // Pops the top of the stack and returns it.
      pop_node(): AST_Node;

      // Returns that internal stack.
      stack(): any;

      // Returns the n-th parent node (where zero means the direct parent).
      parent(n: number): AST_Node;
    }

    /**
     * The code generator is a recursive process of getting back source code from an AST returned by the parser.
     * Every AST node has a “print” method that takes an OutputStream and dumps the code from that node into it.
     * The stream object supports a lot of options that control the output.
     * You can specify whether you'd like to get human-readable (indented) output, the indentation level, whether you'd like to quote all properties in object literals etc.
     */
    function OutputStream(options?: BeautifierOptions): OutputStream;


    interface SourceMapOptions {
      /**
       * The compressed file name
       */
      file?: string;

      /**
       * The root URL to the original sources
       */
      root?: string;

      /**
       * The input source map.
       * Useful when you compress code that was generated from some other source (possibly other programming language).
       * If you have an input source map, pass it in this argument and UglifyJS will generate a mapping that maps back
       * to the original source (as opposed to the compiled code that you are compressing).
       */
      orig?: Object | JSON;
    }

    interface SourceMap {
      add(source: string, gen_line: number, gen_col: number, orig_line: number, orig_col: number, name?: string): void;
      get(): MOZ_SourceMap.SourceMapGenerator;
      toString(): string;
    }

    /**
     * The output stream keeps track of the current line/column in the output and can trivially generate a source mapping to the original code via Mozilla's source-map library.
     * To use this functionality, you must load this library (it's automatically require-d by UglifyJS in the NodeJS version, but in a browser you must load it yourself)
     * and make it available via the global MOZ_SourceMap variable.
     */
    function SourceMap(options?: SourceMapOptions): SourceMap;


    interface CompressorOptions {
      // Join consecutive statemets with the “comma operator”
      sequences?: boolean;

      // Optimize property access: a["foo"] → a.foo
      properties?: boolean;

      // Discard unreachable code
      dead_code?: boolean;

      // Discard “debugger” statements
      drop_debugger?: boolean;

      // Some unsafe optimizations (see below)
      unsafe?: boolean;

      // Optimize if-s and conditional expressions
      conditionals?: boolean;

      // Optimize comparisons
      comparisons?: boolean;

      // Evaluate constant expressions
      evaluate?: boolean;

      // Optimize boolean expressions
      booleans?: boolean;

      // Optimize loops
      loops?: boolean;

      // Drop unused variables/functions
      unused?: boolean;

      // Hoist function declarations
      hoist_funs?: boolean;

      // Hoist variable declarations
      hoist_vars?: boolean;

      // Optimize if-s followed by return/continue
      if_return?: boolean;

      // Join var declarations
      join_vars?: boolean;

      // Try to cascade `right` into `left` in sequences
      cascade?: boolean;

      // Drop side-effect-free statements
      side_effects?: boolean;

      // Warn about potentially dangerous optimizations/code
      warnings?: boolean;

      // Global definitions
      global_defs?: Object;
    }

    /**
     * The compressor is a tree transformer which reduces the code size by applying various optimizations on the AST
     */
    function Compressor(options?: CompressorOptions): AST_Toplevel;


    // TODO
    interface TreeWalker {
    }

    type visitor = (node: AST_Node, descend: Function) => boolean;

    /**
     * UglifyJS provides a TreeWalker object and every node has a walk method that given a walker will apply your visitor to each node in the tree.
     * Your visitor can return a non-falsy value in order to prevent descending the current node.
     */
    function TreeWalker(visitor: visitor): TreeWalker;


    // TODO
    interface TreeTransformer extends TreeWalker {
    }

    /**
     * The tree transformer is a special case of a tree walker.
     * In fact it even inherits from TreeWalker and you can use the same methods, but initialization and visitor protocol are a bit different.
     */
    function TreeTransformer(before: visitor, after: visitor): TreeTransformer;
  }

  export = UglifyJS;
}