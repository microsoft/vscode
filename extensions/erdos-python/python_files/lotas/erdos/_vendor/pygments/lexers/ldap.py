"""
    pygments.lexers.ldap
    ~~~~~~~~~~~~~~~~~~~~

    Pygments lexers for LDAP.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re


from lotas.erdos._vendor.pygments.lexer import RegexLexer, bygroups, default
from lotas.erdos._vendor.pygments.token import Operator, Comment, Keyword, Literal, Name, String, \
    Number, Punctuation, Whitespace, Escape

__all__ = ['LdifLexer', 'LdaprcLexer']


class LdifLexer(RegexLexer):

    """
    Lexer for LDIF
    """

    name = 'LDIF'
    aliases = ['ldif']
    filenames = ['*.ldif']
    mimetypes = ["text/x-ldif"]
    url = "https://datatracker.ietf.org/doc/html/rfc2849"
    version_added = '2.17'

    tokens = {
        'root': [
            (r'\s*\n', Whitespace),
            (r'(-)(\n)', bygroups(Punctuation, Whitespace)),
            (r'(#.*)(\n)', bygroups(Comment.Single, Whitespace)),
            (r'(version)(:)([ \t]*)(.*)([ \t]*\n)', bygroups(Keyword,
             Punctuation, Whitespace, Number.Integer, Whitespace)),
            (r'(control)(:)([ \t]*)([\.0-9]+)([ \t]+)((?:true|false)?)([ \t]*)',
                bygroups(Keyword, Punctuation, Whitespace, Name.Other, Whitespace, Keyword, Whitespace), "after-control"),
            (r'(deleteoldrdn)(:)([ \n]*)([0-1]+)([ \t]*\n)',
             bygroups(Keyword, Punctuation, Whitespace, Number, Whitespace)),
            (r'(add|delete|replace)(::?)(\s*)(.*)([ \t]*\n)', bygroups(
                Keyword, Punctuation, Whitespace, Name.Attribute, Whitespace)),
            (r'(changetype)(:)([ \t]*)([a-z]*)([ \t]*\n)',
             bygroups(Keyword, Punctuation, Whitespace, Keyword, Whitespace)),
            (r'(dn|newrdn)(::)', bygroups(Keyword, Punctuation), "base64-dn"),
            (r'(dn|newrdn)(:)', bygroups(Keyword, Punctuation), "dn"),
            (r'(objectclass)(:)([ \t]*)([^ \t\n]*)([ \t]*\n)', bygroups(
                Keyword, Punctuation, Whitespace, Name.Class, Whitespace)),
            (r'([a-zA-Z]*|[0-9][0-9\.]*[0-9])(;)',
             bygroups(Name.Attribute, Punctuation), "property"),
            (r'([a-zA-Z]*|[0-9][0-9\.]*[0-9])(:<)',
             bygroups(Name.Attribute, Punctuation), "url"),
            (r'([a-zA-Z]*|[0-9][0-9\.]*[0-9])(::?)',
             bygroups(Name.Attribute, Punctuation), "value"),
        ],
        "after-control": [
            (r":<", Punctuation, ("#pop", "url")),
            (r"::?", Punctuation, ("#pop", "value")),
            default("#pop"),
        ],
        'property': [
            (r'([-a-zA-Z0-9]*)(;)', bygroups(Name.Property, Punctuation)),
            (r'([-a-zA-Z0-9]*)(:<)',
             bygroups(Name.Property, Punctuation), ("#pop", "url")),
            (r'([-a-zA-Z0-9]*)(::?)',
             bygroups(Name.Property, Punctuation), ("#pop", "value")),
        ],
        'value': [
            (r'(\s*)([^\n]+\S)(\n )',
             bygroups(Whitespace, String, Whitespace)),
            (r'(\s*)([^\n]+\S)(\n)',
             bygroups(Whitespace, String, Whitespace), "#pop"),
        ],
        'url': [
            (r'([ \t]*)(\S*)([ \t]*\n )',
             bygroups(Whitespace, Comment.PreprocFile, Whitespace)),
            (r'([ \t]*)(\S*)([ \t]*\n)', bygroups(Whitespace,
             Comment.PreprocFile, Whitespace), "#pop"),
        ],
        "dn": [
            (r'([ \t]*)([-a-zA-Z0-9\.]+)(=)', bygroups(Whitespace,
             Name.Attribute, Operator), ("#pop", "dn-value")),
        ],
        "dn-value": [
            (r'\\[^\n]', Escape),
            (r',', Punctuation, ("#pop", "dn")),
            (r'\+', Operator, ("#pop", "dn")),
            (r'[^,\+\n]+', String),
            (r'\n ', Whitespace),
            (r'\n', Whitespace, "#pop"),
        ],
        "base64-dn": [
            (r'([ \t]*)([^ \t\n][^ \t\n]*[^\n])([ \t]*\n )',
             bygroups(Whitespace, Name, Whitespace)),
            (r'([ \t]*)([^ \t\n][^ \t\n]*[^\n])([ \t]*\n)',
             bygroups(Whitespace, Name, Whitespace), "#pop"),
        ]
    }


class LdaprcLexer(RegexLexer):
    """
    Lexer for OpenLDAP configuration files.
    """

    name = 'LDAP configuration file'
    aliases = ['ldapconf', 'ldaprc']
    filenames = ['.ldaprc', 'ldaprc', 'ldap.conf']
    mimetypes = ["text/x-ldapconf"]
    url = 'https://www.openldap.org/software//man.cgi?query=ldap.conf&sektion=5&apropos=0&manpath=OpenLDAP+2.4-Release'
    version_added = '2.17'

    _sasl_keywords = r'SASL_(?:MECH|REALM|AUTHCID|AUTHZID|CBINDING)'
    _tls_keywords = r'TLS_(?:CACERT|CACERTDIR|CERT|ECNAME|KEY|CIPHER_SUITE|PROTOCOL_MIN|RANDFILE|CRLFILE)'
    _literal_keywords = rf'(?:URI|SOCKET_BIND_ADDRESSES|{_sasl_keywords}|{_tls_keywords})'
    _boolean_keywords = r'GSSAPI_(?:ALLOW_REMOTE_PRINCIPAL|ENCRYPT|SIGN)|REFERRALS|SASL_NOCANON'
    _integer_keywords = r'KEEPALIVE_(?:IDLE|PROBES|INTERVAL)|NETWORK_TIMEOUT|PORT|SIZELIMIT|TIMELIMIT|TIMEOUT'
    _secprops = r'none|noanonymous|noplain|noactive|nodict|forwardsec|passcred|(?:minssf|maxssf|maxbufsize)=\d+'

    flags = re.IGNORECASE | re.MULTILINE

    tokens = {
        'root': [
            (r'#.*', Comment.Single),
            (r'\s+', Whitespace),
            (rf'({_boolean_keywords})(\s+)(on|true|yes|off|false|no)$',
             bygroups(Keyword, Whitespace, Keyword.Constant)),
            (rf'({_integer_keywords})(\s+)(\d+)',
             bygroups(Keyword, Whitespace, Number.Integer)),
            (r'(VERSION)(\s+)(2|3)', bygroups(Keyword, Whitespace, Number.Integer)),
            # Constants
            (r'(DEREF)(\s+)(never|searching|finding|always)',
             bygroups(Keyword, Whitespace, Keyword.Constant)),
            (rf'(SASL_SECPROPS)(\s+)((?:{_secprops})(?:,{_secprops})*)',
             bygroups(Keyword, Whitespace, Keyword.Constant)),
            (r'(SASL_CBINDING)(\s+)(none|tls-unique|tls-endpoint)',
             bygroups(Keyword, Whitespace, Keyword.Constant)),
            (r'(TLS_REQ(?:CERT|SAN))(\s+)(allow|demand|hard|never|try)',
             bygroups(Keyword, Whitespace, Keyword.Constant)),
            (r'(TLS_CRLCHECK)(\s+)(none|peer|all)',
             bygroups(Keyword, Whitespace, Keyword.Constant)),
            # Literals
            (r'(BASE|BINDDN)(\s+)(\S+)$',
             bygroups(Keyword, Whitespace, Literal)),
            # Accepts hostname with or without port.
            (r'(HOST)(\s+)([a-z0-9]+)((?::(\d+))?)',
             bygroups(Keyword, Whitespace, Literal, Number.Integer)),
            (rf'({_literal_keywords})(\s+)(\S+)$',
             bygroups(Keyword, Whitespace, Literal)),
        ],
    }
