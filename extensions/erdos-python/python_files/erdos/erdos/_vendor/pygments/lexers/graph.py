"""
    pygments.lexers.graph
    ~~~~~~~~~~~~~~~~~~~~~

    Lexers for graph query languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, using, this, words
from erdos.erdos._vendor.pygments.token import Keyword, Punctuation, Comment, Operator, Name,\
    String, Number, Whitespace


__all__ = ['CypherLexer']


class CypherLexer(RegexLexer):
    """
    For Cypher Query Language

    For the Cypher version in Neo4j 3.3
    """
    name = 'Cypher'
    url = 'https://neo4j.com/docs/developer-manual/3.3/cypher/'
    aliases = ['cypher']
    filenames = ['*.cyp', '*.cypher']
    version_added = '2.0'

    flags = re.MULTILINE | re.IGNORECASE

    tokens = {
        'root': [
            include('clauses'),
            include('keywords'),
            include('relations'),
            include('strings'),
            include('whitespace'),
            include('barewords'),
            include('comment'),
        ],
        'keywords': [
            (r'(create|order|match|limit|set|skip|start|return|with|where|'
             r'delete|foreach|not|by|true|false)\b', Keyword),
        ],
        'clauses': [
            # based on https://neo4j.com/docs/cypher-refcard/3.3/
            (r'(create)(\s+)(index|unique)\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(drop)(\s+)(contraint|index)(\s+)(on)\b',
                bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword)),
            (r'(ends)(\s+)(with)\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(is)(\s+)(node)(\s+)(key)\b',
                bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword)),
            (r'(is)(\s+)(null|unique)\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(load)(\s+)(csv)(\s+)(from)\b',
                bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword)),
            (r'(on)(\s+)(match|create)\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(optional)(\s+)(match)\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(order)(\s+)(by)\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(starts)(\s+)(with)\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(union)(\s+)(all)\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(using)(\s+)(periodic)(\s+)(commit)\b',
                bygroups(Keyword, Whitespace, Keyword, Whitespace, Keyword)),
            (r'(using)(\s+)(index)\b',
                bygroups(Keyword, Whitespace, Keyword)),
            (r'(using)(\s+)(range|text|point)(\s+)(index)\b',
                bygroups(Keyword, Whitespace, Name, Whitespace, Keyword)),
            (words((
                'all', 'any', 'as', 'asc', 'ascending', 'assert', 'call', 'case', 'create',
                'delete', 'desc', 'descending', 'distinct', 'end', 'fieldterminator',
                'foreach', 'in', 'limit', 'match', 'merge', 'none', 'not', 'null',
                'remove', 'return', 'set', 'skip', 'single', 'start', 'then', 'union',
                'unwind', 'yield', 'where', 'when', 'with', 'collect'), suffix=r'\b'), Keyword),
        ],
        'relations': [
            (r'(-\[)(.*?)(\]->)', bygroups(Operator, using(this), Operator)),
            (r'(<-\[)(.*?)(\]-)', bygroups(Operator, using(this), Operator)),
            (r'(-\[)(.*?)(\]-)', bygroups(Operator, using(this), Operator)),
            (r'-->|<--|\[|\]', Operator),
            (r'<|>|<>|=|<=|=>|\(|\)|\||:|,|;', Punctuation),
            (r'[.*{}]', Punctuation),
        ],
        'strings': [
            (r'([\'"])(?:\\[tbnrf\'"\\]|[^\\])*?\1', String),
            (r'`(?:``|[^`])+`', Name.Variable),
        ],
        'whitespace': [
            (r'\s+', Whitespace),
        ],
        'barewords': [
            (r'[a-z]\w*', Name),
            (r'\d+', Number),
        ],
        'comment': [
            (r'//.*$', Comment.Single),
        ],
    }
