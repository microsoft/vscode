"""
    pygments.lexers.ride
    ~~~~~~~~~~~~~~~~~~~~

    Lexer for the Ride programming language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words, include
from erdos.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Punctuation, \
    String, Text

__all__ = ['RideLexer']


class RideLexer(RegexLexer):
    """
    For Ride source code.
    """

    name = 'Ride'
    aliases = ['ride']
    filenames = ['*.ride']
    mimetypes = ['text/x-ride']
    url = 'https://docs.waves.tech/en/ride'
    version_added = '2.6'

    validName = r'[a-zA-Z_][a-zA-Z0-9_\']*'

    builtinOps = (
        '||', '|', '>=', '>', '==', '!',
        '=', '<=', '<', '::', ':+', ':', '!=', '/',
        '.', '=>', '-', '+', '*', '&&', '%', '++',
    )

    globalVariablesName = (
        'NOALG', 'MD5', 'SHA1', 'SHA224', 'SHA256', 'SHA384', 'SHA512',
        'SHA3224', 'SHA3256', 'SHA3384', 'SHA3512', 'nil', 'this', 'unit',
        'height', 'lastBlock', 'Buy', 'Sell', 'CEILING', 'FLOOR', 'DOWN',
        'HALFDOWN', 'HALFEVEN', 'HALFUP', 'UP',
    )

    typesName = (
        'Unit', 'Int', 'Boolean', 'ByteVector', 'String', 'Address', 'Alias',
        'Transfer', 'AssetPair', 'DataEntry', 'Order', 'Transaction',
        'GenesisTransaction', 'PaymentTransaction', 'ReissueTransaction',
        'BurnTransaction', 'MassTransferTransaction', 'ExchangeTransaction',
        'TransferTransaction', 'SetAssetScriptTransaction',
        'InvokeScriptTransaction', 'IssueTransaction', 'LeaseTransaction',
        'LeaseCancelTransaction', 'CreateAliasTransaction',
        'SetScriptTransaction', 'SponsorFeeTransaction', 'DataTransaction',
        'WriteSet', 'AttachedPayment', 'ScriptTransfer', 'TransferSet',
        'ScriptResult', 'Invocation', 'Asset', 'BlockInfo', 'Issue', 'Reissue',
        'Burn', 'NoAlg', 'Md5', 'Sha1', 'Sha224', 'Sha256', 'Sha384', 'Sha512',
        'Sha3224', 'Sha3256', 'Sha3384', 'Sha3512', 'BinaryEntry',
        'BooleanEntry', 'IntegerEntry', 'StringEntry', 'List', 'Ceiling',
        'Down', 'Floor', 'HalfDown', 'HalfEven', 'HalfUp', 'Up',
    )

    functionsName = (
        'fraction', 'size', 'toBytes', 'take', 'drop', 'takeRight', 'dropRight',
        'toString', 'isDefined', 'extract', 'throw', 'getElement', 'value',
        'cons', 'toUtf8String', 'toInt', 'indexOf', 'lastIndexOf', 'split',
        'parseInt', 'parseIntValue', 'keccak256', 'blake2b256', 'sha256',
        'sigVerify', 'toBase58String', 'fromBase58String', 'toBase64String',
        'fromBase64String', 'transactionById', 'transactionHeightById',
        'getInteger', 'getBoolean', 'getBinary', 'getString',
        'addressFromPublicKey', 'addressFromString', 'addressFromRecipient',
        'assetBalance', 'wavesBalance', 'getIntegerValue', 'getBooleanValue',
        'getBinaryValue', 'getStringValue', 'addressFromStringValue',
        'assetInfo', 'rsaVerify', 'checkMerkleProof', 'median',
        'valueOrElse', 'valueOrErrorMessage', 'contains', 'log', 'pow',
        'toBase16String', 'fromBase16String', 'blockInfoByHeight',
        'transferTransactionById',
    )

    reservedWords = words((
        'match', 'case', 'else', 'func', 'if',
        'let', 'then', '@Callable', '@Verifier',
    ), suffix=r'\b')

    tokens = {
        'root': [
            # Comments
            (r'#.*', Comment.Single),
            # Whitespace
            (r'\s+', Text),
            # Strings
            (r'"', String, 'doublequote'),
            (r'utf8\'', String, 'utf8quote'),
            (r'base(58|64|16)\'', String, 'singlequote'),
            # Keywords
            (reservedWords, Keyword.Reserved),
            (r'\{-#.*?#-\}', Keyword.Reserved),
            (r'FOLD<\d+>', Keyword.Reserved),
            # Types
            (words(typesName), Keyword.Type),
            # Main
            # (specialName, Keyword.Reserved),
            # Prefix Operators
            (words(builtinOps, prefix=r'\(', suffix=r'\)'), Name.Function),
            # Infix Operators
            (words(builtinOps), Name.Function),
            (words(globalVariablesName), Name.Function),
            (words(functionsName), Name.Function),
            # Numbers
            include('numbers'),
            # Variable Names
            (validName, Name.Variable),
            # Parens
            (r'[,()\[\]{}]', Punctuation),
        ],

        'doublequote': [
            (r'\\u[0-9a-fA-F]{4}', String.Escape),
            (r'\\[nrfvb\\"]', String.Escape),
            (r'[^"]', String),
            (r'"', String, '#pop'),
        ],

        'utf8quote': [
            (r'\\u[0-9a-fA-F]{4}', String.Escape),
            (r'\\[nrfvb\\\']', String.Escape),
            (r'[^\']', String),
            (r'\'', String, '#pop'),
        ],

        'singlequote': [
            (r'[^\']', String),
            (r'\'', String, '#pop'),
        ],

        'numbers': [
            (r'_?\d+', Number.Integer),
        ],
    }
