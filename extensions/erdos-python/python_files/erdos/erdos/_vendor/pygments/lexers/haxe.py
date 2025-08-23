"""
    pygments.lexers.haxe
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for Haxe and related stuff.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import ExtendedRegexLexer, RegexLexer, include, bygroups, \
    default
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Generic, Whitespace

__all__ = ['HaxeLexer', 'HxmlLexer']


class HaxeLexer(ExtendedRegexLexer):
    """
    For Haxe source code.
    """

    name = 'Haxe'
    url = 'http://haxe.org/'
    aliases = ['haxe', 'hxsl', 'hx']
    filenames = ['*.hx', '*.hxsl']
    mimetypes = ['text/haxe', 'text/x-haxe', 'text/x-hx']
    version_added = '1.3'

    # keywords extracted from lexer.mll in the haxe compiler source
    keyword = (r'(?:function|class|static|var|if|else|while|do|for|'
               r'break|return|continue|extends|implements|import|'
               r'switch|case|default|public|private|try|untyped|'
               r'catch|new|this|throw|extern|enum|in|interface|'
               r'cast|override|dynamic|typedef|package|'
               r'inline|using|null|true|false|abstract)\b')

    # idtype in lexer.mll
    typeid = r'_*[A-Z]\w*'

    # combined ident and dollar and idtype
    ident = r'(?:_*[a-z]\w*|_+[0-9]\w*|' + typeid + r'|_+|\$\w+)'

    binop = (r'(?:%=|&=|\|=|\^=|\+=|\-=|\*=|/=|<<=|>\s*>\s*=|>\s*>\s*>\s*=|==|'
             r'!=|<=|>\s*=|&&|\|\||<<|>>>|>\s*>|\.\.\.|<|>|%|&|\||\^|\+|\*|'
             r'/|\-|=>|=)')

    # ident except keywords
    ident_no_keyword = r'(?!' + keyword + ')' + ident

    flags = re.DOTALL | re.MULTILINE

    preproc_stack = []

    def preproc_callback(self, match, ctx):
        proc = match.group(2)

        if proc == 'if':
            # store the current stack
            self.preproc_stack.append(ctx.stack[:])
        elif proc in ['else', 'elseif']:
            # restore the stack back to right before #if
            if self.preproc_stack:
                ctx.stack = self.preproc_stack[-1][:]
        elif proc == 'end':
            # remove the saved stack of previous #if
            if self.preproc_stack:
                self.preproc_stack.pop()

        # #if and #elseif should follow by an expr
        if proc in ['if', 'elseif']:
            ctx.stack.append('preproc-expr')

        # #error can be optionally follow by the error msg
        if proc in ['error']:
            ctx.stack.append('preproc-error')

        yield match.start(), Comment.Preproc, '#' + proc
        ctx.pos = match.end()

    tokens = {
        'root': [
            include('spaces'),
            include('meta'),
            (r'(?:package)\b', Keyword.Namespace, ('semicolon', 'package')),
            (r'(?:import)\b', Keyword.Namespace, ('semicolon', 'import')),
            (r'(?:using)\b', Keyword.Namespace, ('semicolon', 'using')),
            (r'(?:extern|private)\b', Keyword.Declaration),
            (r'(?:abstract)\b', Keyword.Declaration, 'abstract'),
            (r'(?:class|interface)\b', Keyword.Declaration, 'class'),
            (r'(?:enum)\b', Keyword.Declaration, 'enum'),
            (r'(?:typedef)\b', Keyword.Declaration, 'typedef'),

            # top-level expression
            # although it is not supported in haxe, but it is common to write
            # expression in web pages the positive lookahead here is to prevent
            # an infinite loop at the EOF
            (r'(?=.)', Text, 'expr-statement'),
        ],

        # space/tab/comment/preproc
        'spaces': [
            (r'\s+', Whitespace),
            (r'//[^\n\r]*', Comment.Single),
            (r'/\*.*?\*/', Comment.Multiline),
            (r'(#)(if|elseif|else|end|error)\b', preproc_callback),
        ],

        'string-single-interpol': [
            (r'\$\{', String.Interpol, ('string-interpol-close', 'expr')),
            (r'\$\$', String.Escape),
            (r'\$(?=' + ident + ')', String.Interpol, 'ident'),
            include('string-single'),
        ],

        'string-single': [
            (r"'", String.Single, '#pop'),
            (r'\\.', String.Escape),
            (r'.', String.Single),
        ],

        'string-double': [
            (r'"', String.Double, '#pop'),
            (r'\\.', String.Escape),
            (r'.', String.Double),
        ],

        'string-interpol-close': [
            (r'\$'+ident, String.Interpol),
            (r'\}', String.Interpol, '#pop'),
        ],

        'package': [
            include('spaces'),
            (ident, Name.Namespace),
            (r'\.', Punctuation, 'import-ident'),
            default('#pop'),
        ],

        'import': [
            include('spaces'),
            (ident, Name.Namespace),
            (r'\*', Keyword),  # wildcard import
            (r'\.', Punctuation, 'import-ident'),
            (r'in', Keyword.Namespace, 'ident'),
            default('#pop'),
        ],

        'import-ident': [
            include('spaces'),
            (r'\*', Keyword, '#pop'),  # wildcard import
            (ident, Name.Namespace, '#pop'),
        ],

        'using': [
            include('spaces'),
            (ident, Name.Namespace),
            (r'\.', Punctuation, 'import-ident'),
            default('#pop'),
        ],

        'preproc-error': [
            (r'\s+', Whitespace),
            (r"'", String.Single, ('#pop', 'string-single')),
            (r'"', String.Double, ('#pop', 'string-double')),
            default('#pop'),
        ],

        'preproc-expr': [
            (r'\s+', Whitespace),
            (r'\!', Comment.Preproc),
            (r'\(', Comment.Preproc, ('#pop', 'preproc-parenthesis')),

            (ident, Comment.Preproc, '#pop'),

            # Float
            (r'\.[0-9]+', Number.Float),
            (r'[0-9]+[eE][+\-]?[0-9]+', Number.Float),
            (r'[0-9]+\.[0-9]*[eE][+\-]?[0-9]+', Number.Float),
            (r'[0-9]+\.[0-9]+', Number.Float),
            (r'[0-9]+\.(?!' + ident + r'|\.\.)', Number.Float),

            # Int
            (r'0x[0-9a-fA-F]+', Number.Hex),
            (r'[0-9]+', Number.Integer),

            # String
            (r"'", String.Single, ('#pop', 'string-single')),
            (r'"', String.Double, ('#pop', 'string-double')),
        ],

        'preproc-parenthesis': [
            (r'\s+', Whitespace),
            (r'\)', Comment.Preproc, '#pop'),
            default('preproc-expr-in-parenthesis'),
        ],

        'preproc-expr-chain': [
            (r'\s+', Whitespace),
            (binop, Comment.Preproc, ('#pop', 'preproc-expr-in-parenthesis')),
            default('#pop'),
        ],

        # same as 'preproc-expr' but able to chain 'preproc-expr-chain'
        'preproc-expr-in-parenthesis': [
            (r'\s+', Whitespace),
            (r'\!', Comment.Preproc),
            (r'\(', Comment.Preproc,
             ('#pop', 'preproc-expr-chain', 'preproc-parenthesis')),

            (ident, Comment.Preproc, ('#pop', 'preproc-expr-chain')),

            # Float
            (r'\.[0-9]+', Number.Float, ('#pop', 'preproc-expr-chain')),
            (r'[0-9]+[eE][+\-]?[0-9]+', Number.Float, ('#pop', 'preproc-expr-chain')),
            (r'[0-9]+\.[0-9]*[eE][+\-]?[0-9]+', Number.Float, ('#pop', 'preproc-expr-chain')),
            (r'[0-9]+\.[0-9]+', Number.Float, ('#pop', 'preproc-expr-chain')),
            (r'[0-9]+\.(?!' + ident + r'|\.\.)', Number.Float, ('#pop', 'preproc-expr-chain')),

            # Int
            (r'0x[0-9a-fA-F]+', Number.Hex, ('#pop', 'preproc-expr-chain')),
            (r'[0-9]+', Number.Integer, ('#pop', 'preproc-expr-chain')),

            # String
            (r"'", String.Single,
             ('#pop', 'preproc-expr-chain', 'string-single')),
            (r'"', String.Double,
             ('#pop', 'preproc-expr-chain', 'string-double')),
        ],

        'abstract': [
            include('spaces'),
            default(('#pop', 'abstract-body', 'abstract-relation',
                    'abstract-opaque', 'type-param-constraint', 'type-name')),
        ],

        'abstract-body': [
            include('spaces'),
            (r'\{', Punctuation, ('#pop', 'class-body')),
        ],

        'abstract-opaque': [
            include('spaces'),
            (r'\(', Punctuation, ('#pop', 'parenthesis-close', 'type')),
            default('#pop'),
        ],

        'abstract-relation': [
            include('spaces'),
            (r'(?:to|from)', Keyword.Declaration, 'type'),
            (r',', Punctuation),
            default('#pop'),
        ],

        'meta': [
            include('spaces'),
            (r'@', Name.Decorator, ('meta-body', 'meta-ident', 'meta-colon')),
        ],

        # optional colon
        'meta-colon': [
            include('spaces'),
            (r':', Name.Decorator, '#pop'),
            default('#pop'),
        ],

        # same as 'ident' but set token as Name.Decorator instead of Name
        'meta-ident': [
            include('spaces'),
            (ident, Name.Decorator, '#pop'),
        ],

        'meta-body': [
            include('spaces'),
            (r'\(', Name.Decorator, ('#pop', 'meta-call')),
            default('#pop'),
        ],

        'meta-call': [
            include('spaces'),
            (r'\)', Name.Decorator, '#pop'),
            default(('#pop', 'meta-call-sep', 'expr')),
        ],

        'meta-call-sep': [
            include('spaces'),
            (r'\)', Name.Decorator, '#pop'),
            (r',', Punctuation, ('#pop', 'meta-call')),
        ],

        'typedef': [
            include('spaces'),
            default(('#pop', 'typedef-body', 'type-param-constraint',
                     'type-name')),
        ],

        'typedef-body': [
            include('spaces'),
            (r'=', Operator, ('#pop', 'optional-semicolon', 'type')),
        ],

        'enum': [
            include('spaces'),
            default(('#pop', 'enum-body', 'bracket-open',
                     'type-param-constraint', 'type-name')),
        ],

        'enum-body': [
            include('spaces'),
            include('meta'),
            (r'\}', Punctuation, '#pop'),
            (ident_no_keyword, Name, ('enum-member', 'type-param-constraint')),
        ],

        'enum-member': [
            include('spaces'),
            (r'\(', Punctuation,
             ('#pop', 'semicolon', 'flag', 'function-param')),
            default(('#pop', 'semicolon', 'flag')),
        ],

        'class': [
            include('spaces'),
            default(('#pop', 'class-body', 'bracket-open', 'extends',
                     'type-param-constraint', 'type-name')),
        ],

        'extends': [
            include('spaces'),
            (r'(?:extends|implements)\b', Keyword.Declaration, 'type'),
            (r',', Punctuation),  # the comma is made optional here, since haxe2
                                  # requires the comma but haxe3 does not allow it
            default('#pop'),
        ],

        'bracket-open': [
            include('spaces'),
            (r'\{', Punctuation, '#pop'),
        ],

        'bracket-close': [
            include('spaces'),
            (r'\}', Punctuation, '#pop'),
        ],

        'class-body': [
            include('spaces'),
            include('meta'),
            (r'\}', Punctuation, '#pop'),
            (r'(?:static|public|private|override|dynamic|inline|macro)\b',
             Keyword.Declaration),
            default('class-member'),
        ],

        'class-member': [
            include('spaces'),
            (r'(var)\b', Keyword.Declaration,
             ('#pop', 'optional-semicolon', 'var')),
            (r'(function)\b', Keyword.Declaration,
             ('#pop', 'optional-semicolon', 'class-method')),
        ],

        # local function, anonymous or not
        'function-local': [
            include('spaces'),
            (ident_no_keyword, Name.Function,
             ('#pop', 'optional-expr', 'flag', 'function-param',
              'parenthesis-open', 'type-param-constraint')),
            default(('#pop', 'optional-expr', 'flag', 'function-param',
                     'parenthesis-open', 'type-param-constraint')),
        ],

        'optional-expr': [
            include('spaces'),
            include('expr'),
            default('#pop'),
        ],

        'class-method': [
            include('spaces'),
            (ident, Name.Function, ('#pop', 'optional-expr', 'flag',
                                    'function-param', 'parenthesis-open',
                                    'type-param-constraint')),
        ],

        # function arguments
        'function-param': [
            include('spaces'),
            (r'\)', Punctuation, '#pop'),
            (r'\?', Punctuation),
            (ident_no_keyword, Name,
             ('#pop', 'function-param-sep', 'assign', 'flag')),
        ],

        'function-param-sep': [
            include('spaces'),
            (r'\)', Punctuation, '#pop'),
            (r',', Punctuation, ('#pop', 'function-param')),
        ],

        'prop-get-set': [
            include('spaces'),
            (r'\(', Punctuation, ('#pop', 'parenthesis-close',
                                  'prop-get-set-opt', 'comma', 'prop-get-set-opt')),
            default('#pop'),
        ],

        'prop-get-set-opt': [
            include('spaces'),
            (r'(?:default|null|never|dynamic|get|set)\b', Keyword, '#pop'),
            (ident_no_keyword, Text, '#pop'),  # custom getter/setter
        ],

        'expr-statement': [
            include('spaces'),
            # makes semicolon optional here, just to avoid checking the last
            # one is bracket or not.
            default(('#pop', 'optional-semicolon', 'expr')),
        ],

        'expr': [
            include('spaces'),
            (r'@', Name.Decorator, ('#pop', 'optional-expr', 'meta-body',
                                    'meta-ident', 'meta-colon')),
            (r'(?:\+\+|\-\-|~(?!/)|!|\-)', Operator),
            (r'\(', Punctuation, ('#pop', 'expr-chain', 'parenthesis')),
            (r'(?:static|public|private|override|dynamic|inline)\b',
             Keyword.Declaration),
            (r'(?:function)\b', Keyword.Declaration, ('#pop', 'expr-chain',
                                                      'function-local')),
            (r'\{', Punctuation, ('#pop', 'expr-chain', 'bracket')),
            (r'(?:true|false|null)\b', Keyword.Constant, ('#pop', 'expr-chain')),
            (r'(?:this)\b', Keyword, ('#pop', 'expr-chain')),
            (r'(?:cast)\b', Keyword, ('#pop', 'expr-chain', 'cast')),
            (r'(?:try)\b', Keyword, ('#pop', 'catch', 'expr')),
            (r'(?:var)\b', Keyword.Declaration, ('#pop', 'var')),
            (r'(?:new)\b', Keyword, ('#pop', 'expr-chain', 'new')),
            (r'(?:switch)\b', Keyword, ('#pop', 'switch')),
            (r'(?:if)\b', Keyword, ('#pop', 'if')),
            (r'(?:do)\b', Keyword, ('#pop', 'do')),
            (r'(?:while)\b', Keyword, ('#pop', 'while')),
            (r'(?:for)\b', Keyword, ('#pop', 'for')),
            (r'(?:untyped|throw)\b', Keyword),
            (r'(?:return)\b', Keyword, ('#pop', 'optional-expr')),
            (r'(?:macro)\b', Keyword, ('#pop', 'macro')),
            (r'(?:continue|break)\b', Keyword, '#pop'),
            (r'(?:\$\s*[a-z]\b|\$(?!'+ident+'))', Name, ('#pop', 'dollar')),
            (ident_no_keyword, Name, ('#pop', 'expr-chain')),

            # Float
            (r'\.[0-9]+', Number.Float, ('#pop', 'expr-chain')),
            (r'[0-9]+[eE][+\-]?[0-9]+', Number.Float, ('#pop', 'expr-chain')),
            (r'[0-9]+\.[0-9]*[eE][+\-]?[0-9]+', Number.Float, ('#pop', 'expr-chain')),
            (r'[0-9]+\.[0-9]+', Number.Float, ('#pop', 'expr-chain')),
            (r'[0-9]+\.(?!' + ident + r'|\.\.)', Number.Float, ('#pop', 'expr-chain')),

            # Int
            (r'0x[0-9a-fA-F]+', Number.Hex, ('#pop', 'expr-chain')),
            (r'[0-9]+', Number.Integer, ('#pop', 'expr-chain')),

            # String
            (r"'", String.Single, ('#pop', 'expr-chain', 'string-single-interpol')),
            (r'"', String.Double, ('#pop', 'expr-chain', 'string-double')),

            # EReg
            (r'~/(\\\\|\\[^\\]|[^/\\\n])*/[gimsu]*', String.Regex, ('#pop', 'expr-chain')),

            # Array
            (r'\[', Punctuation, ('#pop', 'expr-chain', 'array-decl')),
        ],

        'expr-chain': [
            include('spaces'),
            (r'(?:\+\+|\-\-)', Operator),
            (binop, Operator, ('#pop', 'expr')),
            (r'(?:in)\b', Keyword, ('#pop', 'expr')),
            (r'\?', Operator, ('#pop', 'expr', 'ternary', 'expr')),
            (r'(\.)(' + ident_no_keyword + ')', bygroups(Punctuation, Name)),
            (r'\[', Punctuation, 'array-access'),
            (r'\(', Punctuation, 'call'),
            default('#pop'),
        ],

        # macro reification
        'macro': [
            include('spaces'),
            include('meta'),
            (r':', Punctuation, ('#pop', 'type')),

            (r'(?:extern|private)\b', Keyword.Declaration),
            (r'(?:abstract)\b', Keyword.Declaration, ('#pop', 'optional-semicolon', 'abstract')),
            (r'(?:class|interface)\b', Keyword.Declaration, ('#pop', 'optional-semicolon', 'macro-class')),
            (r'(?:enum)\b', Keyword.Declaration, ('#pop', 'optional-semicolon', 'enum')),
            (r'(?:typedef)\b', Keyword.Declaration, ('#pop', 'optional-semicolon', 'typedef')),

            default(('#pop', 'expr')),
        ],

        'macro-class': [
            (r'\{', Punctuation, ('#pop', 'class-body')),
            include('class')
        ],

        # cast can be written as "cast expr" or "cast(expr, type)"
        'cast': [
            include('spaces'),
            (r'\(', Punctuation, ('#pop', 'parenthesis-close',
                                  'cast-type', 'expr')),
            default(('#pop', 'expr')),
        ],

        # optionally give a type as the 2nd argument of cast()
        'cast-type': [
            include('spaces'),
            (r',', Punctuation, ('#pop', 'type')),
            default('#pop'),
        ],

        'catch': [
            include('spaces'),
            (r'(?:catch)\b', Keyword, ('expr', 'function-param',
                                       'parenthesis-open')),
            default('#pop'),
        ],

        # do-while loop
        'do': [
            include('spaces'),
            default(('#pop', 'do-while', 'expr')),
        ],

        # the while after do
        'do-while': [
            include('spaces'),
            (r'(?:while)\b', Keyword, ('#pop', 'parenthesis',
                                       'parenthesis-open')),
        ],

        'while': [
            include('spaces'),
            (r'\(', Punctuation, ('#pop', 'expr', 'parenthesis')),
        ],

        'for': [
            include('spaces'),
            (r'\(', Punctuation, ('#pop', 'expr', 'parenthesis')),
        ],

        'if': [
            include('spaces'),
            (r'\(', Punctuation, ('#pop', 'else', 'optional-semicolon', 'expr',
                                  'parenthesis')),
        ],

        'else': [
            include('spaces'),
            (r'(?:else)\b', Keyword, ('#pop', 'expr')),
            default('#pop'),
        ],

        'switch': [
            include('spaces'),
            default(('#pop', 'switch-body', 'bracket-open', 'expr')),
        ],

        'switch-body': [
            include('spaces'),
            (r'(?:case|default)\b', Keyword, ('case-block', 'case')),
            (r'\}', Punctuation, '#pop'),
        ],

        'case': [
            include('spaces'),
            (r':', Punctuation, '#pop'),
            default(('#pop', 'case-sep', 'case-guard', 'expr')),
        ],

        'case-sep': [
            include('spaces'),
            (r':', Punctuation, '#pop'),
            (r',', Punctuation, ('#pop', 'case')),
        ],

        'case-guard': [
            include('spaces'),
            (r'(?:if)\b', Keyword, ('#pop', 'parenthesis', 'parenthesis-open')),
            default('#pop'),
        ],

        # optional multiple expr under a case
        'case-block': [
            include('spaces'),
            (r'(?!(?:case|default)\b|\})', Keyword, 'expr-statement'),
            default('#pop'),
        ],

        'new': [
            include('spaces'),
            default(('#pop', 'call', 'parenthesis-open', 'type')),
        ],

        'array-decl': [
            include('spaces'),
            (r'\]', Punctuation, '#pop'),
            default(('#pop', 'array-decl-sep', 'expr')),
        ],

        'array-decl-sep': [
            include('spaces'),
            (r'\]', Punctuation, '#pop'),
            (r',', Punctuation, ('#pop', 'array-decl')),
        ],

        'array-access': [
            include('spaces'),
            default(('#pop', 'array-access-close', 'expr')),
        ],

        'array-access-close': [
            include('spaces'),
            (r'\]', Punctuation, '#pop'),
        ],

        'comma': [
            include('spaces'),
            (r',', Punctuation, '#pop'),
        ],

        'colon': [
            include('spaces'),
            (r':', Punctuation, '#pop'),
        ],

        'semicolon': [
            include('spaces'),
            (r';', Punctuation, '#pop'),
        ],

        'optional-semicolon': [
            include('spaces'),
            (r';', Punctuation, '#pop'),
            default('#pop'),
        ],

        # identity that CAN be a Haxe keyword
        'ident': [
            include('spaces'),
            (ident, Name, '#pop'),
        ],

        'dollar': [
            include('spaces'),
            (r'\{', Punctuation, ('#pop', 'expr-chain', 'bracket-close', 'expr')),
            default(('#pop', 'expr-chain')),
        ],

        'type-name': [
            include('spaces'),
            (typeid, Name, '#pop'),
        ],

        'type-full-name': [
            include('spaces'),
            (r'\.', Punctuation, 'ident'),
            default('#pop'),
        ],

        'type': [
            include('spaces'),
            (r'\?', Punctuation),
            (ident, Name, ('#pop', 'type-check', 'type-full-name')),
            (r'\{', Punctuation, ('#pop', 'type-check', 'type-struct')),
            (r'\(', Punctuation, ('#pop', 'type-check', 'type-parenthesis')),
        ],

        'type-parenthesis': [
            include('spaces'),
            default(('#pop', 'parenthesis-close', 'type')),
        ],

        'type-check': [
            include('spaces'),
            (r'->', Punctuation, ('#pop', 'type')),
            (r'<(?!=)', Punctuation, 'type-param'),
            default('#pop'),
        ],

        'type-struct': [
            include('spaces'),
            (r'\}', Punctuation, '#pop'),
            (r'\?', Punctuation),
            (r'>', Punctuation, ('comma', 'type')),
            (ident_no_keyword, Name, ('#pop', 'type-struct-sep', 'type', 'colon')),
            include('class-body'),
        ],

        'type-struct-sep': [
            include('spaces'),
            (r'\}', Punctuation, '#pop'),
            (r',', Punctuation, ('#pop', 'type-struct')),
        ],

        # type-param can be a normal type or a constant literal...
        'type-param-type': [
            # Float
            (r'\.[0-9]+', Number.Float, '#pop'),
            (r'[0-9]+[eE][+\-]?[0-9]+', Number.Float, '#pop'),
            (r'[0-9]+\.[0-9]*[eE][+\-]?[0-9]+', Number.Float, '#pop'),
            (r'[0-9]+\.[0-9]+', Number.Float, '#pop'),
            (r'[0-9]+\.(?!' + ident + r'|\.\.)', Number.Float, '#pop'),

            # Int
            (r'0x[0-9a-fA-F]+', Number.Hex, '#pop'),
            (r'[0-9]+', Number.Integer, '#pop'),

            # String
            (r"'", String.Single, ('#pop', 'string-single')),
            (r'"', String.Double, ('#pop', 'string-double')),

            # EReg
            (r'~/(\\\\|\\[^\\]|[^/\\\n])*/[gim]*', String.Regex, '#pop'),

            # Array
            (r'\[', Operator, ('#pop', 'array-decl')),

            include('type'),
        ],

        # type-param part of a type
        # ie. the <A,B> path in Map<A,B>
        'type-param': [
            include('spaces'),
            default(('#pop', 'type-param-sep', 'type-param-type')),
        ],

        'type-param-sep': [
            include('spaces'),
            (r'>', Punctuation, '#pop'),
            (r',', Punctuation, ('#pop', 'type-param')),
        ],

        # optional type-param that may include constraint
        # ie. <T:Constraint, T2:(ConstraintA,ConstraintB)>
        'type-param-constraint': [
            include('spaces'),
            (r'<(?!=)', Punctuation, ('#pop', 'type-param-constraint-sep',
                                      'type-param-constraint-flag', 'type-name')),
            default('#pop'),
        ],

        'type-param-constraint-sep': [
            include('spaces'),
            (r'>', Punctuation, '#pop'),
            (r',', Punctuation, ('#pop', 'type-param-constraint-sep',
                                 'type-param-constraint-flag', 'type-name')),
        ],

        # the optional constraint inside type-param
        'type-param-constraint-flag': [
            include('spaces'),
            (r':', Punctuation, ('#pop', 'type-param-constraint-flag-type')),
            default('#pop'),
        ],

        'type-param-constraint-flag-type': [
            include('spaces'),
            (r'\(', Punctuation, ('#pop', 'type-param-constraint-flag-type-sep',
                                  'type')),
            default(('#pop', 'type')),
        ],

        'type-param-constraint-flag-type-sep': [
            include('spaces'),
            (r'\)', Punctuation, '#pop'),
            (r',', Punctuation, 'type'),
        ],

        # a parenthesis expr that contain exactly one expr
        'parenthesis': [
            include('spaces'),
            default(('#pop', 'parenthesis-close', 'flag', 'expr')),
        ],

        'parenthesis-open': [
            include('spaces'),
            (r'\(', Punctuation, '#pop'),
        ],

        'parenthesis-close': [
            include('spaces'),
            (r'\)', Punctuation, '#pop'),
        ],

        'var': [
            include('spaces'),
            (ident_no_keyword, Text, ('#pop', 'var-sep', 'assign', 'flag', 'prop-get-set')),
        ],

        # optional more var decl.
        'var-sep': [
            include('spaces'),
            (r',', Punctuation, ('#pop', 'var')),
            default('#pop'),
        ],

        # optional assignment
        'assign': [
            include('spaces'),
            (r'=', Operator, ('#pop', 'expr')),
            default('#pop'),
        ],

        # optional type flag
        'flag': [
            include('spaces'),
            (r':', Punctuation, ('#pop', 'type')),
            default('#pop'),
        ],

        # colon as part of a ternary operator (?:)
        'ternary': [
            include('spaces'),
            (r':', Operator, '#pop'),
        ],

        # function call
        'call': [
            include('spaces'),
            (r'\)', Punctuation, '#pop'),
            default(('#pop', 'call-sep', 'expr')),
        ],

        # after a call param
        'call-sep': [
            include('spaces'),
            (r'\)', Punctuation, '#pop'),
            (r',', Punctuation, ('#pop', 'call')),
        ],

        # bracket can be block or object
        'bracket': [
            include('spaces'),
            (r'(?!(?:\$\s*[a-z]\b|\$(?!'+ident+')))' + ident_no_keyword, Name,
             ('#pop', 'bracket-check')),
            (r"'", String.Single, ('#pop', 'bracket-check', 'string-single')),
            (r'"', String.Double, ('#pop', 'bracket-check', 'string-double')),
            default(('#pop', 'block')),
        ],

        'bracket-check': [
            include('spaces'),
            (r':', Punctuation, ('#pop', 'object-sep', 'expr')),  # is object
            default(('#pop', 'block', 'optional-semicolon', 'expr-chain')),  # is block
        ],

        # code block
        'block': [
            include('spaces'),
            (r'\}', Punctuation, '#pop'),
            default('expr-statement'),
        ],

        # object in key-value pairs
        'object': [
            include('spaces'),
            (r'\}', Punctuation, '#pop'),
            default(('#pop', 'object-sep', 'expr', 'colon', 'ident-or-string'))
        ],

        # a key of an object
        'ident-or-string': [
            include('spaces'),
            (ident_no_keyword, Name, '#pop'),
            (r"'", String.Single, ('#pop', 'string-single')),
            (r'"', String.Double, ('#pop', 'string-double')),
        ],

        # after a key-value pair in object
        'object-sep': [
            include('spaces'),
            (r'\}', Punctuation, '#pop'),
            (r',', Punctuation, ('#pop', 'object')),
        ],



    }

    def analyse_text(text):
        if re.match(r'\w+\s*:\s*\w', text):
            return 0.3


class HxmlLexer(RegexLexer):
    """
    Lexer for haXe build files.
    """
    name = 'Hxml'
    url = 'https://haxe.org/manual/compiler-usage-hxml.html'
    aliases = ['haxeml', 'hxml']
    filenames = ['*.hxml']
    version_added = '1.6'

    tokens = {
        'root': [
            # Separator
            (r'(--)(next)', bygroups(Punctuation, Generic.Heading)),
            # Compiler switches with one dash
            (r'(-)(prompt|debug|v)', bygroups(Punctuation, Keyword.Keyword)),
            # Compilerswitches with two dashes
            (r'(--)(neko-source|flash-strict|flash-use-stage|no-opt|no-traces|'
             r'no-inline|times|no-output)', bygroups(Punctuation, Keyword)),
            # Targets and other options that take an argument
            (r'(-)(cpp|js|neko|x|as3|swf9?|swf-lib|php|xml|main|lib|D|resource|'
             r'cp|cmd)( +)(.+)',
             bygroups(Punctuation, Keyword, Whitespace, String)),
            # Options that take only numerical arguments
            (r'(-)(swf-version)( +)(\d+)',
             bygroups(Punctuation, Keyword, Whitespace, Number.Integer)),
            # An Option that defines the size, the fps and the background
            # color of an flash movie
            (r'(-)(swf-header)( +)(\d+)(:)(\d+)(:)(\d+)(:)([A-Fa-f0-9]{6})',
             bygroups(Punctuation, Keyword, Whitespace, Number.Integer,
                      Punctuation, Number.Integer, Punctuation, Number.Integer,
                      Punctuation, Number.Hex)),
            # options with two dashes that takes arguments
            (r'(--)(js-namespace|php-front|php-lib|remap|gen-hx-classes)( +)'
             r'(.+)', bygroups(Punctuation, Keyword, Whitespace, String)),
            # Single line comment, multiline ones are not allowed.
            (r'#.*', Comment.Single)
        ]
    }
