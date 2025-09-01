"""
    pygments.lexers.asc
    ~~~~~~~~~~~~~~~~~~~

    Lexer for various ASCII armored files.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""
import re

from erdos._vendor.pygments.lexer import RegexLexer, bygroups
from erdos._vendor.pygments.token import Comment, Generic, Name, Operator, String, Whitespace

__all__ = ['AscLexer']


class AscLexer(RegexLexer):
    """
    Lexer for ASCII armored files, containing `-----BEGIN/END ...-----` wrapped
    base64 data.
    """
    name = 'ASCII armored'
    aliases = ['asc', 'pem']
    filenames = [
        '*.asc',  # PGP; *.gpg, *.pgp, and *.sig too, but those can be binary
        '*.pem',  # X.509; *.cer, *.crt, *.csr, and key etc too, but those can be binary
        'id_dsa', 'id_ecdsa', 'id_ecdsa_sk', 'id_ed25519', 'id_ed25519_sk',
        'id_rsa',  # SSH private keys
    ]
    mimetypes = ['application/pgp-keys', 'application/pgp-encrypted',
                 'application/pgp-signature', 'application/pem-certificate-chain']
    url = 'https://www.openpgp.org'
    version_added = '2.10'

    flags = re.MULTILINE

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'^-----BEGIN [^\n]+-----$', Generic.Heading, 'data'),
            (r'\S+', Comment),
        ],
        'data': [
            (r'\s+', Whitespace),
            (r'^([^:]+)(:)([ \t]+)(.*)',
             bygroups(Name.Attribute, Operator, Whitespace, String)),
            (r'^-----END [^\n]+-----$', Generic.Heading, 'root'),
            (r'\S+', String),
        ],
    }

    def analyse_text(text):
        if re.search(r'^-----BEGIN [^\n]+-----\r?\n', text):
            return True
