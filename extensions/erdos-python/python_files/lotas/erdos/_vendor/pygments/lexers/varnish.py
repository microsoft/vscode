"""
    pygments.lexers.varnish
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Varnish configuration

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using, this, \
    inherit, words
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Literal, Whitespace

__all__ = ['VCLLexer', 'VCLSnippetLexer']


class VCLLexer(RegexLexer):
    """
    For Varnish Configuration Language (VCL).
    """
    name = 'VCL'
    aliases = ['vcl']
    filenames = ['*.vcl']
    mimetypes = ['text/x-vclsrc']
    url = 'https://www.varnish-software.com/developers/tutorials/varnish-configuration-language-vcl'
    version_added = '2.2'

    def analyse_text(text):
        # If the very first line is 'vcl 4.0;' it's pretty much guaranteed
        # that this is VCL
        if text.startswith('vcl 4.0;'):
            return 1.0
        # Skip over comments and blank lines
        # This is accurate enough that returning 0.9 is reasonable.
        # Almost no VCL files start without some comments.
        elif '\nvcl 4.0;' in text[:1000]:
            return 0.9

    tokens = {
        'probe': [
            include('whitespace'),
            include('comments'),
            (r'(\.\w+)(\s*=\s*)([^;]*)(;)',
             bygroups(Name.Attribute, Operator, using(this), Punctuation)),
            (r'\}', Punctuation, '#pop'),
        ],
        'acl': [
            include('whitespace'),
            include('comments'),
            (r'[!/]+', Operator),
            (r';', Punctuation),
            (r'\d+', Number),
            (r'\}', Punctuation, '#pop'),
        ],
        'backend': [
            include('whitespace'),
            (r'(\.probe)(\s*=\s*)(\w+)(;)',
             bygroups(Name.Attribute, Operator, Name.Variable.Global, Punctuation)),
            (r'(\.probe)(\s*=\s*)(\{)',
             bygroups(Name.Attribute, Operator, Punctuation), 'probe'),
            (r'(\.\w+\b)(\s*=\s*)([^;\s]*)(\s*;)',
             bygroups(Name.Attribute, Operator, using(this), Punctuation)),
            (r'\{', Punctuation, '#push'),
            (r'\}', Punctuation, '#pop'),
        ],
        'statements': [
            (r'(\d\.)?\d+[sdwhmy]', Literal.Date),
            (r'(\d\.)?\d+ms', Literal.Date),
            (r'(vcl_pass|vcl_hash|vcl_hit|vcl_init|vcl_backend_fetch|vcl_pipe|'
             r'vcl_backend_response|vcl_synth|vcl_deliver|vcl_backend_error|'
             r'vcl_fini|vcl_recv|vcl_purge|vcl_miss)\b', Name.Function),
            (r'(pipe|retry|hash|synth|deliver|purge|abandon|lookup|pass|fail|ok|'
             r'miss|fetch|restart)\b', Name.Constant),
            (r'(beresp|obj|resp|req|req_top|bereq)\.http\.[a-zA-Z_-]+\b', Name.Variable),
            (words((
                'obj.status', 'req.hash_always_miss', 'beresp.backend', 'req.esi_level',
                'req.can_gzip', 'beresp.ttl', 'obj.uncacheable', 'req.ttl', 'obj.hits',
                'client.identity', 'req.hash_ignore_busy', 'obj.reason', 'req.xid',
                'req_top.proto', 'beresp.age', 'obj.proto', 'obj.age', 'local.ip',
                'beresp.uncacheable', 'req.method', 'beresp.backend.ip', 'now',
                'obj.grace', 'req.restarts', 'beresp.keep', 'req.proto', 'resp.proto',
                'bereq.xid', 'bereq.between_bytes_timeout', 'req.esi',
                'bereq.first_byte_timeout', 'bereq.method', 'bereq.connect_timeout',
                'beresp.do_gzip',  'resp.status', 'beresp.do_gunzip',
                'beresp.storage_hint', 'resp.is_streaming', 'beresp.do_stream',
                'req_top.method', 'bereq.backend', 'beresp.backend.name', 'beresp.status',
                'req.url', 'obj.keep', 'obj.ttl', 'beresp.reason', 'bereq.retries',
                'resp.reason', 'bereq.url', 'beresp.do_esi', 'beresp.proto', 'client.ip',
                'bereq.proto', 'server.hostname', 'remote.ip', 'req.backend_hint',
                'server.identity', 'req_top.url', 'beresp.grace', 'beresp.was_304',
                'server.ip', 'bereq.uncacheable'), suffix=r'\b'),
             Name.Variable),
            (r'[!%&+*\-,/<.}{>=|~]+', Operator),
            (r'[();]', Punctuation),

            (r'[,]+', Punctuation),
            (words(('hash_data', 'regsub', 'regsuball', 'if', 'else',
                    'elsif', 'elif', 'synth', 'synthetic', 'ban',
                    'return', 'set', 'unset', 'import', 'include', 'new',
                    'rollback', 'call'), suffix=r'\b'),
             Keyword),
            (r'storage\.\w+\.\w+\b', Name.Variable),
            (words(('true', 'false')), Name.Builtin),
            (r'\d+\b', Number),
            (r'(backend)(\s+\w+)(\s*\{)',
             bygroups(Keyword, Name.Variable.Global, Punctuation), 'backend'),
            (r'(probe\s)(\s*\w+\s)(\{)',
             bygroups(Keyword, Name.Variable.Global, Punctuation), 'probe'),
            (r'(acl\s)(\s*\w+\s)(\{)',
             bygroups(Keyword, Name.Variable.Global, Punctuation), 'acl'),
            (r'(vcl )(4.0)(;)$',
             bygroups(Keyword.Reserved, Name.Constant, Punctuation)),
            (r'(sub\s+)([a-zA-Z]\w*)(\s*\{)',
                bygroups(Keyword, Name.Function, Punctuation)),
            (r'([a-zA-Z_]\w*)'
             r'(\.)'
             r'([a-zA-Z_]\w*)'
             r'(\s*\(.*\))',
             bygroups(Name.Function, Punctuation, Name.Function, using(this))),
            (r'[a-zA-Z_]\w*', Name),
        ],
        'comment': [
            (r'[^*/]+', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ],
        'comments': [
            (r'#.*$', Comment),
            (r'/\*', Comment.Multiline, 'comment'),
            (r'//.*$', Comment),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'[^"\n]+', String),  # all other characters
        ],
        'multistring': [
            (r'[^"}]', String),
            (r'"\}', String, '#pop'),
            (r'["}]', String),
        ],
        'whitespace': [
            (r'L?"', String, 'string'),
            (r'\{"', String, 'multistring'),
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'\\\n', Text),  # line continuation
        ],
        'root': [
            include('whitespace'),
            include('comments'),
            include('statements'),
            (r'\s+', Whitespace),
        ],
    }


class VCLSnippetLexer(VCLLexer):
    """
    For Varnish Configuration Language snippets.
    """
    name = 'VCLSnippets'
    aliases = ['vclsnippets', 'vclsnippet']
    mimetypes = ['text/x-vclsnippet']
    filenames = []
    url = 'https://www.varnish-software.com/developers/tutorials/varnish-configuration-language-vcl'
    version_added = '2.2'

    def analyse_text(text):
        # override method inherited from VCLLexer
        return 0

    tokens = {
        'snippetspre': [
            (r'\.\.\.+', Comment),
            (r'(bereq|req|req_top|resp|beresp|obj|client|server|local|remote|'
             r'storage)($|\.\*)', Name.Variable),
        ],
        'snippetspost': [
            (r'(backend)\b', Keyword.Reserved),
        ],
        'root': [
            include('snippetspre'),
            inherit,
            include('snippetspost'),
        ],
    }
