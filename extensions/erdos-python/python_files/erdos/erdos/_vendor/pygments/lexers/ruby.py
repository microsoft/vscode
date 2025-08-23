"""
    pygments.lexers.ruby
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for Ruby and related languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import Lexer, RegexLexer, ExtendedRegexLexer, include, \
    bygroups, default, LexerContext, do_insertions, words, line_re
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Error, Generic, Whitespace
from erdos.erdos._vendor.pygments.util import shebang_matches

__all__ = ['RubyLexer', 'RubyConsoleLexer', 'FancyLexer']


RUBY_OPERATORS = (
    '*', '**', '-', '+', '-@', '+@', '/', '%', '&', '|', '^', '`', '~',
    '[]', '[]=', '<<', '>>', '<', '<>', '<=>', '>', '>=', '==', '==='
)


class RubyLexer(ExtendedRegexLexer):
    """
    For Ruby source code.
    """

    name = 'Ruby'
    url = 'http://www.ruby-lang.org'
    aliases = ['ruby', 'rb', 'duby']
    filenames = ['*.rb', '*.rbw', 'Rakefile', '*.rake', '*.gemspec',
                 '*.rbx', '*.duby', 'Gemfile', 'Vagrantfile']
    mimetypes = ['text/x-ruby', 'application/x-ruby']
    version_added = ''

    flags = re.DOTALL | re.MULTILINE

    def heredoc_callback(self, match, ctx):
        # okay, this is the hardest part of parsing Ruby...
        # match: 1 = <<[-~]?, 2 = quote? 3 = name 4 = quote? 5 = rest of line

        start = match.start(1)
        yield start, Operator, match.group(1)        # <<[-~]?
        yield match.start(2), String.Heredoc, match.group(2)   # quote ", ', `
        yield match.start(3), String.Delimiter, match.group(3) # heredoc name
        yield match.start(4), String.Heredoc, match.group(4)   # quote again

        heredocstack = ctx.__dict__.setdefault('heredocstack', [])
        outermost = not bool(heredocstack)
        heredocstack.append((match.group(1) in ('<<-', '<<~'), match.group(3)))

        ctx.pos = match.start(5)
        ctx.end = match.end(5)
        # this may find other heredocs, so limit the recursion depth
        if len(heredocstack) < 100:
            yield from self.get_tokens_unprocessed(context=ctx)
        else:
            yield ctx.pos, String.Heredoc, match.group(5)
        ctx.pos = match.end()

        if outermost:
            # this is the outer heredoc again, now we can process them all
            for tolerant, hdname in heredocstack:
                lines = []
                for match in line_re.finditer(ctx.text, ctx.pos):
                    if tolerant:
                        check = match.group().strip()
                    else:
                        check = match.group().rstrip()
                    if check == hdname:
                        for amatch in lines:
                            yield amatch.start(), String.Heredoc, amatch.group()
                        yield match.start(), String.Delimiter, match.group()
                        ctx.pos = match.end()
                        break
                    else:
                        lines.append(match)
                else:
                    # end of heredoc not found -- error!
                    for amatch in lines:
                        yield amatch.start(), Error, amatch.group()
            ctx.end = len(ctx.text)
            del heredocstack[:]

    def gen_rubystrings_rules():
        def intp_regex_callback(self, match, ctx):
            yield match.start(1), String.Regex, match.group(1)  # begin
            nctx = LexerContext(match.group(3), 0, ['interpolated-regex'])
            for i, t, v in self.get_tokens_unprocessed(context=nctx):
                yield match.start(3)+i, t, v
            yield match.start(4), String.Regex, match.group(4)  # end[mixounse]*
            ctx.pos = match.end()

        def intp_string_callback(self, match, ctx):
            yield match.start(1), String.Other, match.group(1)
            nctx = LexerContext(match.group(3), 0, ['interpolated-string'])
            for i, t, v in self.get_tokens_unprocessed(context=nctx):
                yield match.start(3)+i, t, v
            yield match.start(4), String.Other, match.group(4)  # end
            ctx.pos = match.end()

        states = {}
        states['strings'] = [
            # easy ones
            (r'\:@{0,2}[a-zA-Z_]\w*[!?]?', String.Symbol),
            (words(RUBY_OPERATORS, prefix=r'\:@{0,2}'), String.Symbol),
            (r":'(\\\\|\\[^\\]|[^'\\])*'", String.Symbol),
            (r':"', String.Symbol, 'simple-sym'),
            (r'([a-zA-Z_]\w*)(:)(?!:)',
             bygroups(String.Symbol, Punctuation)),  # Since Ruby 1.9
            (r'"', String.Double, 'simple-string-double'),
            (r"'", String.Single, 'simple-string-single'),
            (r'(?<!\.)`', String.Backtick, 'simple-backtick'),
        ]

        # quoted string and symbol
        for name, ttype, end in ('string-double', String.Double, '"'), \
                                ('string-single', String.Single, "'"),\
                                ('sym', String.Symbol, '"'), \
                                ('backtick', String.Backtick, '`'):
            states['simple-'+name] = [
                include('string-intp-escaped'),
                (rf'[^\\{end}#]+', ttype),
                (r'[\\#]', ttype),
                (end, ttype, '#pop'),
            ]

        # braced quoted strings
        for lbrace, rbrace, bracecc, name in \
                ('\\{', '\\}', '{}', 'cb'), \
                ('\\[', '\\]', '\\[\\]', 'sb'), \
                ('\\(', '\\)', '()', 'pa'), \
                ('<', '>', '<>', 'ab'):
            states[name+'-intp-string'] = [
                (r'\\[\\' + bracecc + ']', String.Other),
                (lbrace, String.Other, '#push'),
                (rbrace, String.Other, '#pop'),
                include('string-intp-escaped'),
                (r'[\\#' + bracecc + ']', String.Other),
                (r'[^\\#' + bracecc + ']+', String.Other),
            ]
            states['strings'].append((r'%[QWx]?' + lbrace, String.Other,
                                      name+'-intp-string'))
            states[name+'-string'] = [
                (r'\\[\\' + bracecc + ']', String.Other),
                (lbrace, String.Other, '#push'),
                (rbrace, String.Other, '#pop'),
                (r'[\\#' + bracecc + ']', String.Other),
                (r'[^\\#' + bracecc + ']+', String.Other),
            ]
            states['strings'].append((r'%[qsw]' + lbrace, String.Other,
                                      name+'-string'))
            states[name+'-regex'] = [
                (r'\\[\\' + bracecc + ']', String.Regex),
                (lbrace, String.Regex, '#push'),
                (rbrace + '[mixounse]*', String.Regex, '#pop'),
                include('string-intp'),
                (r'[\\#' + bracecc + ']', String.Regex),
                (r'[^\\#' + bracecc + ']+', String.Regex),
            ]
            states['strings'].append((r'%r' + lbrace, String.Regex,
                                      name+'-regex'))

        # these must come after %<brace>!
        states['strings'] += [
            # %r regex
            (r'(%r([\W_]))((?:\\\2|(?!\2).)*)(\2[mixounse]*)',
             intp_regex_callback),
            # regular fancy strings with qsw
            (r'%[qsw]([\W_])((?:\\\1|(?!\1).)*)\1', String.Other),
            (r'(%[QWx]([\W_]))((?:\\\2|(?!\2).)*)(\2)',
             intp_string_callback),
            # special forms of fancy strings after operators or
            # in method calls with braces
            (r'(?<=[-+/*%=<>&!^|~,(])(\s*)(%([\t ])(?:(?:\\\3|(?!\3).)*)\3)',
             bygroups(Whitespace, String.Other, None)),
            # and because of fixed width lookbehinds the whole thing a
            # second time for line startings...
            (r'^(\s*)(%([\t ])(?:(?:\\\3|(?!\3).)*)\3)',
             bygroups(Whitespace, String.Other, None)),
            # all regular fancy strings without qsw
            (r'(%([^a-zA-Z0-9\s]))((?:\\\2|(?!\2).)*)(\2)',
             intp_string_callback),
        ]

        return states

    tokens = {
        'root': [
            (r'\A#!.+?$', Comment.Hashbang),
            (r'#.*?$', Comment.Single),
            (r'=begin\s.*?\n=end.*?$', Comment.Multiline),
            # keywords
            (words((
                'BEGIN', 'END', 'alias', 'begin', 'break', 'case', 'defined?',
                'do', 'else', 'elsif', 'end', 'ensure', 'for', 'if', 'in', 'next', 'redo',
                'rescue', 'raise', 'retry', 'return', 'super', 'then', 'undef',
                'unless', 'until', 'when', 'while', 'yield'), suffix=r'\b'),
             Keyword),
            # start of function, class and module names
            (r'(module)(\s+)([a-zA-Z_]\w*'
             r'(?:::[a-zA-Z_]\w*)*)',
             bygroups(Keyword, Whitespace, Name.Namespace)),
            (r'(def)(\s+)', bygroups(Keyword, Whitespace), 'funcname'),
            (r'def(?=[*%&^`~+-/\[<>=])', Keyword, 'funcname'),
            (r'(class)(\s+)', bygroups(Keyword, Whitespace), 'classname'),
            # special methods
            (words((
                'initialize', 'new', 'loop', 'include', 'extend', 'raise', 'attr_reader',
                'attr_writer', 'attr_accessor', 'attr', 'catch', 'throw', 'private',
                'module_function', 'public', 'protected', 'true', 'false', 'nil'),
                suffix=r'\b'),
             Keyword.Pseudo),
            (r'(not|and|or)\b', Operator.Word),
            (words((
                'autoload', 'block_given', 'const_defined', 'eql', 'equal', 'frozen', 'include',
                'instance_of', 'is_a', 'iterator', 'kind_of', 'method_defined', 'nil',
                'private_method_defined', 'protected_method_defined',
                'public_method_defined', 'respond_to', 'tainted'), suffix=r'\?'),
             Name.Builtin),
            (r'(chomp|chop|exit|gsub|sub)!', Name.Builtin),
            (words((
                'Array', 'Float', 'Integer', 'String', '__id__', '__send__', 'abort',
                'ancestors', 'at_exit', 'autoload', 'binding', 'callcc', 'caller',
                'catch', 'chomp', 'chop', 'class_eval', 'class_variables',
                'clone', 'const_defined?', 'const_get', 'const_missing', 'const_set',
                'constants', 'display', 'dup', 'eval', 'exec', 'exit', 'extend', 'fail', 'fork',
                'format', 'freeze', 'getc', 'gets', 'global_variables', 'gsub',
                'hash', 'id', 'included_modules', 'inspect', 'instance_eval',
                'instance_method', 'instance_methods',
                'instance_variable_get', 'instance_variable_set', 'instance_variables',
                'lambda', 'load', 'local_variables', 'loop',
                'method', 'method_missing', 'methods', 'module_eval', 'name',
                'object_id', 'open', 'p', 'print', 'printf', 'private_class_method',
                'private_instance_methods',
                'private_methods', 'proc', 'protected_instance_methods',
                'protected_methods', 'public_class_method',
                'public_instance_methods', 'public_methods',
                'putc', 'puts', 'raise', 'rand', 'readline', 'readlines', 'require',
                'scan', 'select', 'self', 'send', 'set_trace_func', 'singleton_methods', 'sleep',
                'split', 'sprintf', 'srand', 'sub', 'syscall', 'system', 'taint',
                'test', 'throw', 'to_a', 'to_s', 'trace_var', 'trap', 'untaint',
                'untrace_var', 'warn'), prefix=r'(?<!\.)', suffix=r'\b'),
             Name.Builtin),
            (r'__(FILE|LINE)__\b', Name.Builtin.Pseudo),
            # normal heredocs
            (r'(?<!\w)(<<[-~]?)(["`\']?)([a-zA-Z_]\w*)(\2)(.*?\n)',
             heredoc_callback),
            # empty string heredocs
            (r'(<<[-~]?)("|\')()(\2)(.*?\n)', heredoc_callback),
            (r'__END__', Comment.Preproc, 'end-part'),
            # multiline regex (after keywords or assignments)
            (r'(?:^|(?<=[=<>~!:])|'
             r'(?<=(?:\s|;)when\s)|'
             r'(?<=(?:\s|;)or\s)|'
             r'(?<=(?:\s|;)and\s)|'
             r'(?<=\.index\s)|'
             r'(?<=\.scan\s)|'
             r'(?<=\.sub\s)|'
             r'(?<=\.sub!\s)|'
             r'(?<=\.gsub\s)|'
             r'(?<=\.gsub!\s)|'
             r'(?<=\.match\s)|'
             r'(?<=(?:\s|;)if\s)|'
             r'(?<=(?:\s|;)elsif\s)|'
             r'(?<=^when\s)|'
             r'(?<=^index\s)|'
             r'(?<=^scan\s)|'
             r'(?<=^sub\s)|'
             r'(?<=^gsub\s)|'
             r'(?<=^sub!\s)|'
             r'(?<=^gsub!\s)|'
             r'(?<=^match\s)|'
             r'(?<=^if\s)|'
             r'(?<=^elsif\s)'
             r')(\s*)(/)', bygroups(Text, String.Regex), 'multiline-regex'),
            # multiline regex (in method calls or subscripts)
            (r'(?<=\(|,|\[)/', String.Regex, 'multiline-regex'),
            # multiline regex (this time the funny no whitespace rule)
            (r'(\s+)(/)(?![\s=])', bygroups(Whitespace, String.Regex),
             'multiline-regex'),
            # lex numbers and ignore following regular expressions which
            # are division operators in fact (grrrr. i hate that. any
            # better ideas?)
            # since pygments 0.7 we also eat a "?" operator after numbers
            # so that the char operator does not work. Chars are not allowed
            # there so that you can use the ternary operator.
            # stupid example:
            #   x>=0?n[x]:""
            (r'(0_?[0-7]+(?:_[0-7]+)*)(\s*)([/?])?',
             bygroups(Number.Oct, Whitespace, Operator)),
            (r'(0x[0-9A-Fa-f]+(?:_[0-9A-Fa-f]+)*)(\s*)([/?])?',
             bygroups(Number.Hex, Whitespace, Operator)),
            (r'(0b[01]+(?:_[01]+)*)(\s*)([/?])?',
             bygroups(Number.Bin, Whitespace, Operator)),
            (r'([\d]+(?:_\d+)*)(\s*)([/?])?',
             bygroups(Number.Integer, Whitespace, Operator)),
            # Names
            (r'@@[a-zA-Z_]\w*', Name.Variable.Class),
            (r'@[a-zA-Z_]\w*', Name.Variable.Instance),
            (r'\$\w+', Name.Variable.Global),
            (r'\$[!@&`\'+~=/\\,;.<>_*$?:"^-]', Name.Variable.Global),
            (r'\$-[0adFiIlpvw]', Name.Variable.Global),
            (r'::', Operator),
            include('strings'),
            # chars
            (r'\?(\\[MC]-)*'  # modifiers
             r'(\\([\\abefnrstv#"\']|x[a-fA-F0-9]{1,2}|[0-7]{1,3})|\S)'
             r'(?!\w)',
             String.Char),
            (r'[A-Z]\w+', Name.Constant),
            # this is needed because ruby attributes can look
            # like keywords (class) or like this: ` ?!?
            (words(RUBY_OPERATORS, prefix=r'(\.|::)'),
             bygroups(Operator, Name.Operator)),
            (r'(\.|::)([a-zA-Z_]\w*[!?]?|[*%&^`~+\-/\[<>=])',
             bygroups(Operator, Name)),
            (r'[a-zA-Z_]\w*[!?]?', Name),
            (r'(\[|\]|\*\*|<<?|>>?|>=|<=|<=>|=~|={3}|'
             r'!~|&&?|\|\||\.{1,3})', Operator),
            (r'[-+/*%=<>&!^|~]=?', Operator),
            (r'[(){};,/?:\\]', Punctuation),
            (r'\s+', Whitespace)
        ],
        'funcname': [
            (r'\(', Punctuation, 'defexpr'),
            (r'(?:([a-zA-Z_]\w*)(\.))?'  # optional scope name, like "self."
             r'('
                r'[a-zA-Z\u0080-\uffff][a-zA-Z0-9_\u0080-\uffff]*[!?=]?'  # method name
                r'|!=|!~|=~|\*\*?|[-+!~]@?|[/%&|^]|<=>|<[<=]?|>[>=]?|===?'  # or operator override
                r'|\[\]=?'  # or element reference/assignment override
                r'|`'  # or the undocumented backtick override
             r')',
             bygroups(Name.Class, Operator, Name.Function), '#pop'),
            default('#pop')
        ],
        'classname': [
            (r'\(', Punctuation, 'defexpr'),
            (r'<<', Operator, '#pop'),
            (r'[A-Z_]\w*', Name.Class, '#pop'),
            default('#pop')
        ],
        'defexpr': [
            (r'(\))(\.|::)?', bygroups(Punctuation, Operator), '#pop'),
            (r'\(', Operator, '#push'),
            include('root')
        ],
        'in-intp': [
            (r'\{', String.Interpol, '#push'),
            (r'\}', String.Interpol, '#pop'),
            include('root'),
        ],
        'string-intp': [
            (r'#\{', String.Interpol, 'in-intp'),
            (r'#@@?[a-zA-Z_]\w*', String.Interpol),
            (r'#\$[a-zA-Z_]\w*', String.Interpol)
        ],
        'string-intp-escaped': [
            include('string-intp'),
            (r'\\([\\abefnrstv#"\']|x[a-fA-F0-9]{1,2}|[0-7]{1,3})',
             String.Escape)
        ],
        'interpolated-regex': [
            include('string-intp'),
            (r'[\\#]', String.Regex),
            (r'[^\\#]+', String.Regex),
        ],
        'interpolated-string': [
            include('string-intp'),
            (r'[\\#]', String.Other),
            (r'[^\\#]+', String.Other),
        ],
        'multiline-regex': [
            include('string-intp'),
            (r'\\\\', String.Regex),
            (r'\\/', String.Regex),
            (r'[\\#]', String.Regex),
            (r'[^\\/#]+', String.Regex),
            (r'/[mixounse]*', String.Regex, '#pop'),
        ],
        'end-part': [
            (r'.+', Comment.Preproc, '#pop')
        ]
    }
    tokens.update(gen_rubystrings_rules())

    def analyse_text(text):
        return shebang_matches(text, r'ruby(1\.\d)?')


class RubyConsoleLexer(Lexer):
    """
    For Ruby interactive console (**irb**) output.
    """
    name = 'Ruby irb session'
    aliases = ['rbcon', 'irb']
    mimetypes = ['text/x-ruby-shellsession']
    url = 'https://www.ruby-lang.org'
    version_added = ''
    _example = 'rbcon/console'

    _prompt_re = re.compile(r'irb\([a-zA-Z_]\w*\):\d{3}:\d+[>*"\'] '
                            r'|>> |\?> ')

    def get_tokens_unprocessed(self, text):
        rblexer = RubyLexer(**self.options)

        curcode = ''
        insertions = []
        for match in line_re.finditer(text):
            line = match.group()
            m = self._prompt_re.match(line)
            if m is not None:
                end = m.end()
                insertions.append((len(curcode),
                                   [(0, Generic.Prompt, line[:end])]))
                curcode += line[end:]
            else:
                if curcode:
                    yield from do_insertions(
                        insertions, rblexer.get_tokens_unprocessed(curcode))
                    curcode = ''
                    insertions = []
                yield match.start(), Generic.Output, line
        if curcode:
            yield from do_insertions(
                insertions, rblexer.get_tokens_unprocessed(curcode))


class FancyLexer(RegexLexer):
    """
    Pygments Lexer For Fancy.

    Fancy is a self-hosted, pure object-oriented, dynamic,
    class-based, concurrent general-purpose programming language
    running on Rubinius, the Ruby VM.
    """
    name = 'Fancy'
    url = 'https://github.com/bakkdoor/fancy'
    filenames = ['*.fy', '*.fancypack']
    aliases = ['fancy', 'fy']
    mimetypes = ['text/x-fancysrc']
    version_added = '1.5'

    tokens = {
        # copied from PerlLexer:
        'balanced-regex': [
            (r'/(\\\\|\\[^\\]|[^/\\])*/[egimosx]*', String.Regex, '#pop'),
            (r'!(\\\\|\\[^\\]|[^!\\])*![egimosx]*', String.Regex, '#pop'),
            (r'\\(\\\\|[^\\])*\\[egimosx]*', String.Regex, '#pop'),
            (r'\{(\\\\|\\[^\\]|[^}\\])*\}[egimosx]*', String.Regex, '#pop'),
            (r'<(\\\\|\\[^\\]|[^>\\])*>[egimosx]*', String.Regex, '#pop'),
            (r'\[(\\\\|\\[^\\]|[^\]\\])*\][egimosx]*', String.Regex, '#pop'),
            (r'\((\\\\|\\[^\\]|[^)\\])*\)[egimosx]*', String.Regex, '#pop'),
            (r'@(\\\\|\\[^\\]|[^@\\])*@[egimosx]*', String.Regex, '#pop'),
            (r'%(\\\\|\\[^\\]|[^%\\])*%[egimosx]*', String.Regex, '#pop'),
            (r'\$(\\\\|\\[^\\]|[^$\\])*\$[egimosx]*', String.Regex, '#pop'),
        ],
        'root': [
            (r'\s+', Whitespace),

            # balanced delimiters (copied from PerlLexer):
            (r's\{(\\\\|\\[^\\]|[^}\\])*\}\s*', String.Regex, 'balanced-regex'),
            (r's<(\\\\|\\[^\\]|[^>\\])*>\s*', String.Regex, 'balanced-regex'),
            (r's\[(\\\\|\\[^\\]|[^\]\\])*\]\s*', String.Regex, 'balanced-regex'),
            (r's\((\\\\|\\[^\\]|[^)\\])*\)\s*', String.Regex, 'balanced-regex'),
            (r'm?/(\\\\|\\[^\\]|[^///\n])*/[gcimosx]*', String.Regex),
            (r'm(?=[/!\\{<\[(@%$])', String.Regex, 'balanced-regex'),

            # Comments
            (r'#(.*?)\n', Comment.Single),
            # Symbols
            (r'\'([^\'\s\[\](){}]+|\[\])', String.Symbol),
            # Multi-line DoubleQuotedString
            (r'"""(\\\\|\\[^\\]|[^\\])*?"""', String),
            # DoubleQuotedString
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String),
            # keywords
            (r'(def|class|try|catch|finally|retry|return|return_local|match|'
             r'case|->|=>)\b', Keyword),
            # constants
            (r'(self|super|nil|false|true)\b', Name.Constant),
            (r'[(){};,/?|:\\]', Punctuation),
            # names
            (words((
                'Object', 'Array', 'Hash', 'Directory', 'File', 'Class', 'String',
                'Number', 'Enumerable', 'FancyEnumerable', 'Block', 'TrueClass',
                'NilClass', 'FalseClass', 'Tuple', 'Symbol', 'Stack', 'Set',
                'FancySpec', 'Method', 'Package', 'Range'), suffix=r'\b'),
             Name.Builtin),
            # functions
            (r'[a-zA-Z](\w|[-+?!=*/^><%])*:', Name.Function),
            # operators, must be below functions
            (r'[-+*/~,<>=&!?%^\[\].$]+', Operator),
            (r'[A-Z]\w*', Name.Constant),
            (r'@[a-zA-Z_]\w*', Name.Variable.Instance),
            (r'@@[a-zA-Z_]\w*', Name.Variable.Class),
            ('@@?', Operator),
            (r'[a-zA-Z_]\w*', Name),
            # numbers - / checks are necessary to avoid mismarking regexes,
            # see comment in RubyLexer
            (r'(0[oO]?[0-7]+(?:_[0-7]+)*)(\s*)([/?])?',
             bygroups(Number.Oct, Whitespace, Operator)),
            (r'(0[xX][0-9A-Fa-f]+(?:_[0-9A-Fa-f]+)*)(\s*)([/?])?',
             bygroups(Number.Hex, Whitespace, Operator)),
            (r'(0[bB][01]+(?:_[01]+)*)(\s*)([/?])?',
             bygroups(Number.Bin, Whitespace, Operator)),
            (r'([\d]+(?:_\d+)*)(\s*)([/?])?',
             bygroups(Number.Integer, Whitespace, Operator)),
            (r'\d+([eE][+-]?[0-9]+)|\d+\.\d+([eE][+-]?[0-9]+)?', Number.Float),
            (r'\d+', Number.Integer)
        ]
    }
