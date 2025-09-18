import includes from "lodash/includes";
import trimEnd from "lodash/trimEnd";
import tokenTypes from "./tokenTypes";
import Indentation from "./Indentation";
import InlineBlock from "./InlineBlock";
import Params from "./Params";

interface FormatterConfig {
    indent?: string;
    params?: Record<string, unknown>;
}

export default class Formatter {
    private cfg: FormatterConfig;
    private indentation: any;
    private inlineBlock: any;
    private params: any;
    private tokenizer: any;
    private previousReservedWord: Record<string, unknown>;
    private tokens: any[];
    private index: number;

    /**
     * @param {Object} cfg
     *   @param {Object} cfg.indent
     *   @param {Object} cfg.params
     * @param {Tokenizer} tokenizer
     */
    constructor(cfg: FormatterConfig, tokenizer: any) {
        this.cfg = cfg || {};
        this.indentation = new Indentation(this.cfg.indent);
        this.inlineBlock = new InlineBlock();
        this.params = new Params(this.cfg.params);
        this.tokenizer = tokenizer;
        this.previousReservedWord = {};
        this.tokens = [];
        this.index = 0;
    }

    /**
     * Formats whitespaces in a SQL string to make it easier to read.
     *
     * @param {String} query The SQL query string
     * @return {String} formatted query
     */
    format(query) {
        this.tokens = this.tokenizer.tokenize(query);
        const formattedQuery = this.getFormattedQueryFromTokens();

        return formattedQuery.trim();
    }

    getFormattedQueryFromTokens() {
        let formattedQuery = "";

        this.tokens.forEach((token, index) => {
            this.index = index;

            if (token.type === tokenTypes.WHITESPACE) {
                // ignore (we do our own whitespace formatting)
            }
            else if (token.type === tokenTypes.LINE_COMMENT) {
                formattedQuery = this.formatLineComment(token, formattedQuery);
            }
            else if (token.type === tokenTypes.BLOCK_COMMENT) {
                formattedQuery = this.formatBlockComment(token, formattedQuery);
            }
            else if (token.type === tokenTypes.RESERVED_TOPLEVEL) {
                formattedQuery = this.formatToplevelReservedWord(token, formattedQuery);
                this.previousReservedWord = token;
            }
            else if (token.type === tokenTypes.RESERVED_NEWLINE) {
                formattedQuery = this.formatNewlineReservedWord(token, formattedQuery);
                this.previousReservedWord = token;
            }
            else if (token.type === tokenTypes.RESERVED) {
                formattedQuery = this.formatWithSpaces(token, formattedQuery);
                this.previousReservedWord = token;
            }
            else if (token.type === tokenTypes.OPEN_PAREN) {
                formattedQuery = this.formatOpeningParentheses(token, formattedQuery);
            }
            else if (token.type === tokenTypes.CLOSE_PAREN) {
                formattedQuery = this.formatClosingParentheses(token, formattedQuery);
            }
            else if (token.type === tokenTypes.PLACEHOLDER) {
                formattedQuery = this.formatPlaceholder(token, formattedQuery);
            }
            else if (token.value === ",") {
                formattedQuery = this.formatComma(token, formattedQuery);
            }
            else if (token.value === ":") {
                formattedQuery = this.formatWithSpaceAfter(token, formattedQuery);
            }
            else if (token.value === ".") {
                formattedQuery = this.formatWithoutSpaces(token, formattedQuery);
            }
            else if (token.value === ";") {
                formattedQuery = this.formatQuerySeparator(token, formattedQuery);
            }
            else {
                formattedQuery = this.formatWithSpaces(token, formattedQuery);
            }
        });
        return formattedQuery;
    }

    formatLineComment(token, query) {
        return this.addNewline(query + token.value);
    }

    formatBlockComment(token, query) {
        return this.addNewline(this.addNewline(query) + this.indentComment(token.value));
    }

    indentComment(comment) {
        return comment.replace(/\n/g, "\n" + this.indentation.getIndent());
    }

    formatToplevelReservedWord(token, query) {
        this.indentation.decreaseTopLevel();

        query = this.addNewline(query);

        this.indentation.increaseToplevel();

        query += this.equalizeWhitespace(token.value);
        return this.addNewline(query);
    }

    formatNewlineReservedWord(token, query) {
        return this.addNewline(query) + this.equalizeWhitespace(token.value) + " ";
    }

    // Replace any sequence of whitespace characters with single space
    equalizeWhitespace(string) {
        return string.replace(/\s+/g, " ");
    }

    // Opening parentheses increase the block indent level and start a new line
    formatOpeningParentheses(token, query) {
        // Take out the preceding space unless there was whitespace there in the original query
        // or another opening parens or line comment
        const preserveWhitespaceFor = [
            tokenTypes.WHITESPACE,
            tokenTypes.OPEN_PAREN,
            tokenTypes.LINE_COMMENT,
        ];
        if (!includes(preserveWhitespaceFor, this.previousToken().type)) {
            query = trimEnd(query);
        }
        query += token.value;

        this.inlineBlock.beginIfPossible(this.tokens, this.index);

        if (!this.inlineBlock.isActive()) {
            this.indentation.increaseBlockLevel();
            query = this.addNewline(query);
        }
        return query;
    }

    // Closing parentheses decrease the block indent level
    formatClosingParentheses(token, query) {
        if (this.inlineBlock.isActive()) {
            this.inlineBlock.end();
            return this.formatWithSpaceAfter(token, query);
        }
        else {
            this.indentation.decreaseBlockLevel();
            return this.formatWithSpaces(token, this.addNewline(query));
        }
    }

    formatPlaceholder(token, query) {
        return query + this.params.get(token) + " ";
    }

    // Commas start a new line (unless within inline parentheses or SQL "LIMIT" clause)
    formatComma(token, query) {
        query = this.trimTrailingWhitespace(query) + token.value + " ";

        if (this.inlineBlock.isActive()) {
            return query;
        }
        else if (/^LIMIT$/i.test(this.previousReservedWord.value as string)) {
            return query;
        }
        else {
            return this.addNewline(query);
        }
    }

    formatWithSpaceAfter(token, query) {
        return this.trimTrailingWhitespace(query) + token.value + " ";
    }

    formatWithoutSpaces(token, query) {
        return this.trimTrailingWhitespace(query) + token.value;
    }

    formatWithSpaces(token, query) {
        return query + token.value + " ";
    }

    formatQuerySeparator(token, query) {
        return this.trimTrailingWhitespace(query) + token.value + "\n";
    }

    addNewline(query) {
        return trimEnd(query) + "\n" + this.indentation.getIndent();
    }

    trimTrailingWhitespace(query) {
        if (this.previousNonWhitespaceToken().type === tokenTypes.LINE_COMMENT) {
            return trimEnd(query) + "\n";
        }
        else {
            return trimEnd(query);
        }
    }

    previousNonWhitespaceToken() {
        let n = 1;
        while (this.previousToken(n).type === tokenTypes.WHITESPACE) {
            n++;
        }
        return this.previousToken(n);
    }

    previousToken(offset = 1) {
        return this.tokens[this.index - offset] || {};
    }
}