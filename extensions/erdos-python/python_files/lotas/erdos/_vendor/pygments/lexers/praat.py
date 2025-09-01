"""
    pygments.lexers.praat
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for Praat

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, words, bygroups, include
from erdos._vendor.pygments.token import Name, Text, Comment, Keyword, String, Punctuation, \
    Number, Operator, Whitespace

__all__ = ['PraatLexer']


class PraatLexer(RegexLexer):
    """
    For Praat scripts.
    """

    name = 'Praat'
    url = 'http://www.praat.org'
    aliases = ['praat']
    filenames = ['*.praat', '*.proc', '*.psc']
    version_added = '2.1'

    keywords = (
        'if', 'then', 'else', 'elsif', 'elif', 'endif', 'fi', 'for', 'from', 'to',
        'endfor', 'endproc', 'while', 'endwhile', 'repeat', 'until', 'select', 'plus',
        'minus', 'demo', 'assert', 'stopwatch', 'nocheck', 'nowarn', 'noprogress',
        'editor', 'endeditor', 'clearinfo',
    )

    functions_string = (
        'backslashTrigraphsToUnicode', 'chooseDirectory', 'chooseReadFile',
        'chooseWriteFile', 'date', 'demoKey', 'do', 'environment', 'extractLine',
        'extractWord', 'fixed', 'info', 'left', 'mid', 'percent', 'readFile', 'replace',
        'replace_regex', 'right', 'selected', 'string', 'unicodeToBackslashTrigraphs',
    )

    functions_numeric = (
        'abs', 'appendFile', 'appendFileLine', 'appendInfo', 'appendInfoLine', 'arccos',
        'arccosh', 'arcsin', 'arcsinh', 'arctan', 'arctan2', 'arctanh', 'barkToHertz',
        'beginPause', 'beginSendPraat', 'besselI', 'besselK', 'beta', 'beta2',
        'binomialP', 'binomialQ', 'boolean', 'ceiling', 'chiSquareP', 'chiSquareQ',
        'choice', 'comment', 'cos', 'cosh', 'createDirectory', 'deleteFile',
        'demoClicked', 'demoClickedIn', 'demoCommandKeyPressed',
        'demoExtraControlKeyPressed', 'demoInput', 'demoKeyPressed',
        'demoOptionKeyPressed', 'demoShiftKeyPressed', 'demoShow', 'demoWaitForInput',
        'demoWindowTitle', 'demoX', 'demoY', 'differenceLimensToPhon', 'do', 'editor',
        'endPause', 'endSendPraat', 'endsWith', 'erb', 'erbToHertz', 'erf', 'erfc',
        'exitScript', 'exp', 'extractNumber', 'fileReadable', 'fisherP', 'fisherQ',
        'floor', 'gaussP', 'gaussQ', 'hertzToBark', 'hertzToErb', 'hertzToMel',
        'hertzToSemitones', 'imax', 'imin', 'incompleteBeta', 'incompleteGammaP', 'index',
        'index_regex', 'integer', 'invBinomialP', 'invBinomialQ', 'invChiSquareQ', 'invFisherQ',
        'invGaussQ', 'invSigmoid', 'invStudentQ', 'length', 'ln', 'lnBeta', 'lnGamma',
        'log10', 'log2', 'max', 'melToHertz', 'min', 'minusObject', 'natural', 'number',
        'numberOfColumns', 'numberOfRows', 'numberOfSelected', 'objectsAreIdentical',
        'option', 'optionMenu', 'pauseScript', 'phonToDifferenceLimens', 'plusObject',
        'positive', 'randomBinomial', 'randomGauss', 'randomInteger', 'randomPoisson',
        'randomUniform', 'real', 'readFile', 'removeObject', 'rindex', 'rindex_regex',
        'round', 'runScript', 'runSystem', 'runSystem_nocheck', 'selectObject',
        'selected', 'semitonesToHertz', 'sentence', 'sentencetext', 'sigmoid', 'sin', 'sinc',
        'sincpi', 'sinh', 'soundPressureToPhon', 'sqrt', 'startsWith', 'studentP',
        'studentQ', 'tan', 'tanh', 'text', 'variableExists', 'word', 'writeFile', 'writeFileLine',
        'writeInfo', 'writeInfoLine',
    )

    functions_array = (
        'linear', 'randomGauss', 'randomInteger', 'randomUniform', 'zero',
    )

    objects = (
        'Activation', 'AffineTransform', 'AmplitudeTier', 'Art', 'Artword',
        'Autosegment', 'BarkFilter', 'BarkSpectrogram', 'CCA', 'Categories',
        'Cepstrogram', 'Cepstrum', 'Cepstrumc', 'ChebyshevSeries', 'ClassificationTable',
        'Cochleagram', 'Collection', 'ComplexSpectrogram', 'Configuration', 'Confusion',
        'ContingencyTable', 'Corpus', 'Correlation', 'Covariance',
        'CrossCorrelationTable', 'CrossCorrelationTables', 'DTW', 'DataModeler',
        'Diagonalizer', 'Discriminant', 'Dissimilarity', 'Distance', 'Distributions',
        'DurationTier', 'EEG', 'ERP', 'ERPTier', 'EditCostsTable', 'EditDistanceTable',
        'Eigen', 'Excitation', 'Excitations', 'ExperimentMFC', 'FFNet', 'FeatureWeights',
        'FileInMemory', 'FilesInMemory', 'Formant', 'FormantFilter', 'FormantGrid',
        'FormantModeler', 'FormantPoint', 'FormantTier', 'GaussianMixture', 'HMM',
        'HMM_Observation', 'HMM_ObservationSequence', 'HMM_State', 'HMM_StateSequence',
        'Harmonicity', 'ISpline', 'Index', 'Intensity', 'IntensityTier', 'IntervalTier',
        'KNN', 'KlattGrid', 'KlattTable', 'LFCC', 'LPC', 'Label', 'LegendreSeries',
        'LinearRegression', 'LogisticRegression', 'LongSound', 'Ltas', 'MFCC', 'MSpline',
        'ManPages', 'Manipulation', 'Matrix', 'MelFilter', 'MelSpectrogram',
        'MixingMatrix', 'Movie', 'Network', 'Object', 'OTGrammar', 'OTHistory', 'OTMulti',
        'PCA', 'PairDistribution', 'ParamCurve', 'Pattern', 'Permutation', 'Photo',
        'Pitch', 'PitchModeler', 'PitchTier', 'PointProcess', 'Polygon', 'Polynomial',
        'PowerCepstrogram', 'PowerCepstrum', 'Procrustes', 'RealPoint', 'RealTier',
        'ResultsMFC', 'Roots', 'SPINET', 'SSCP', 'SVD', 'Salience', 'ScalarProduct',
        'Similarity', 'SimpleString', 'SortedSetOfString', 'Sound', 'Speaker',
        'Spectrogram', 'Spectrum', 'SpectrumTier', 'SpeechSynthesizer', 'SpellingChecker',
        'Strings', 'StringsIndex', 'Table', 'TableOfReal', 'TextGrid', 'TextInterval',
        'TextPoint', 'TextTier', 'Tier', 'Transition', 'VocalTract', 'VocalTractTier',
        'Weight', 'WordList',
    )

    variables_numeric = (
        'macintosh', 'windows', 'unix', 'praatVersion', 'pi', 'e', 'undefined',
    )

    variables_string = (
        'praatVersion', 'tab', 'shellDirectory', 'homeDirectory',
        'preferencesDirectory', 'newline', 'temporaryDirectory',
        'defaultDirectory',
    )

    object_attributes = (
        'ncol', 'nrow', 'xmin', 'ymin', 'xmax', 'ymax', 'nx', 'ny', 'dx', 'dy',
    )

    tokens = {
        'root': [
            (r'(\s+)(#.*?$)',  bygroups(Whitespace, Comment.Single)),
            (r'^#.*?$',        Comment.Single),
            (r';[^\n]*',       Comment.Single),
            (r'\s+',           Whitespace),

            (r'\bprocedure\b', Keyword,       'procedure_definition'),
            (r'\bcall\b',      Keyword,       'procedure_call'),
            (r'@',             Name.Function, 'procedure_call'),

            include('function_call'),

            (words(keywords, suffix=r'\b'), Keyword),

            (r'(\bform\b)(\s+)([^\n]+)',
             bygroups(Keyword, Whitespace, String), 'old_form'),

            (r'(print(?:line|tab)?|echo|exit|asserterror|pause|send(?:praat|socket)|'
             r'include|execute|system(?:_nocheck)?)(\s+)',
             bygroups(Keyword, Whitespace), 'string_unquoted'),

            (r'(goto|label)(\s+)(\w+)', bygroups(Keyword, Whitespace, Name.Label)),

            include('variable_name'),
            include('number'),

            (r'"', String, 'string'),

            (words((objects), suffix=r'(?=\s+\S+\n)'), Name.Class, 'string_unquoted'),

            (r'\b[A-Z]', Keyword, 'command'),
            (r'(\.{3}|[)(,])', Punctuation),
        ],
        'command': [
            (r'( ?[\w()-]+ ?)', Keyword),

            include('string_interpolated'),

            (r'\.{3}', Keyword, ('#pop', 'old_arguments')),
            (r':', Keyword, ('#pop', 'comma_list')),
            (r'\s', Whitespace, '#pop'),
        ],
        'procedure_call': [
            (r'\s+', Whitespace),
            (r'([\w.]+)(?:(:)|(?:(\s*)(\()))',
             bygroups(Name.Function, Punctuation,
                      Text.Whitespace, Punctuation), '#pop'),
            (r'([\w.]+)', Name.Function, ('#pop', 'old_arguments')),
        ],
        'procedure_definition': [
            (r'\s', Whitespace),
            (r'([\w.]+)(\s*?[(:])',
             bygroups(Name.Function, Whitespace), '#pop'),
            (r'([\w.]+)([^\n]*)',
             bygroups(Name.Function, Text), '#pop'),
        ],
        'function_call': [
            (words(functions_string, suffix=r'\$(?=\s*[:(])'), Name.Function, 'function'),
            (words(functions_array, suffix=r'#(?=\s*[:(])'),   Name.Function, 'function'),
            (words(functions_numeric, suffix=r'(?=\s*[:(])'),  Name.Function, 'function'),
        ],
        'function': [
            (r'\s+',   Whitespace),
            (r':',     Punctuation, ('#pop', 'comma_list')),
            (r'\s*\(', Punctuation, ('#pop', 'comma_list')),
        ],
        'comma_list': [
            (r'(\s*\n\s*)(\.{3})', bygroups(Whitespace, Punctuation)),

            (r'(\s*)(?:([)\]])|(\n))', bygroups(
                Whitespace, Punctuation, Whitespace), '#pop'),

            (r'\s+', Whitespace),
            (r'"',   String, 'string'),
            (r'\b(if|then|else|fi|endif)\b', Keyword),

            include('function_call'),
            include('variable_name'),
            include('operator'),
            include('number'),

            (r'[()]', Text),
            (r',', Punctuation),
        ],
        'old_arguments': [
            (r'\n', Whitespace, '#pop'),

            include('variable_name'),
            include('operator'),
            include('number'),

            (r'"', String, 'string'),
            (r'[^\n]', Text),
        ],
        'number': [
            (r'\n', Whitespace, '#pop'),
            (r'\b\d+(\.\d*)?([eE][-+]?\d+)?%?', Number),
        ],
        'object_reference': [
            include('string_interpolated'),
            (r'([a-z][a-zA-Z0-9_]*|\d+)', Name.Builtin),

            (words(object_attributes, prefix=r'\.'), Name.Builtin, '#pop'),

            (r'\$', Name.Builtin),
            (r'\[', Text, '#pop'),
        ],
        'variable_name': [
            include('operator'),
            include('number'),

            (words(variables_string,  suffix=r'\$'), Name.Variable.Global),
            (words(variables_numeric,
             suffix=r'(?=[^a-zA-Z0-9_."\'$#\[:(]|\s|^|$)'),
             Name.Variable.Global),

            (words(objects, prefix=r'\b', suffix=r"(_)"),
             bygroups(Name.Builtin, Name.Builtin),
             'object_reference'),

            (r'\.?_?[a-z][\w.]*(\$|#)?', Text),
            (r'[\[\]]', Punctuation, 'comma_list'),

            include('string_interpolated'),
        ],
        'operator': [
            (r'([+\/*<>=!-]=?|[&*|][&*|]?|\^|<>)',       Operator),
            (r'(?<![\w.])(and|or|not|div|mod)(?![\w.])', Operator.Word),
        ],
        'string_interpolated': [
            (r'\'[_a-z][^\[\]\'":]*(\[([\d,]+|"[\w,]+")\])?(:[0-9]+)?\'',
             String.Interpol),
        ],
        'string_unquoted': [
            (r'(\n\s*)(\.{3})', bygroups(Whitespace, Punctuation)),

            (r'\n',       Whitespace,            '#pop'),
            (r'\s',       Whitespace),

            include('string_interpolated'),

            (r"'",        String),
            (r"[^'\n]+",  String),
        ],
        'string': [
            (r'(\n\s*)(\.{3})', bygroups(Whitespace, Punctuation)),

            (r'"',          String,          '#pop'),

            include('string_interpolated'),

            (r"'",          String),
            (r'[^\'"\n]+',  String),
        ],
        'old_form': [
            (r'(\s+)(#.*?$)',  bygroups(Whitespace, Comment.Single)),
            (r'\s+', Whitespace),

            (r'(optionmenu|choice)([ \t]+)(\S+)(:)([ \t]+)',
             bygroups(Keyword, Whitespace, Text, Punctuation, Whitespace), 'number'),

            (r'(option|button)([ \t]+)',
             bygroups(Keyword, Whitespace), 'string_unquoted'),

            (r'(sentence|text)([ \t]+)(\S+)',
             bygroups(Keyword, Whitespace, String), 'string_unquoted'),

            (r'(word)([ \t]+)(\S+)([ \t]*)(\S+)?(?:([ \t]+)(.*))?',
             bygroups(Keyword, Whitespace, Text, Whitespace, Text, Whitespace, Text)),

            (r'(boolean)(\s+\S+\s*)(0|1|"?(?:yes|no)"?)',
             bygroups(Keyword, Whitespace, Name.Variable)),

            # Ideally processing of the number would happen in the 'number'
            # but that doesn't seem to work
            (r'(real|natural|positive|integer)([ \t]+\S+[ \t]*)([+-]?)(\d+(?:\.\d*)?'
             r'(?:[eE][-+]?\d+)?%?)',
             bygroups(Keyword, Whitespace, Operator, Number)),

            (r'(comment)(\s+)',
             bygroups(Keyword, Whitespace), 'string_unquoted'),

            (r'\bendform\b', Keyword, '#pop'),
        ]
    }
