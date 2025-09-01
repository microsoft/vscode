"""
    pygments.lexers.c_like
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for other C-like languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, inherit, words, \
    default
from erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

from erdos._vendor.pygments.lexers.c_cpp import CLexer, CppLexer
from erdos._vendor.pygments.lexers import _mql_builtins

__all__ = ['PikeLexer', 'NesCLexer', 'ClayLexer', 'ECLexer', 'ValaLexer',
           'CudaLexer', 'SwigLexer', 'MqlLexer', 'ArduinoLexer', 'CharmciLexer',
           'OmgIdlLexer', 'PromelaLexer']


class PikeLexer(CppLexer):
    """
    For `Pike <http://pike.lysator.liu.se/>`_ source code.
    """
    name = 'Pike'
    aliases = ['pike']
    filenames = ['*.pike', '*.pmod']
    mimetypes = ['text/x-pike']
    version_added = '2.0'

    tokens = {
        'statements': [
            (words((
                'catch', 'new', 'private', 'protected', 'public', 'gauge',
                'throw', 'throws', 'class', 'interface', 'implement', 'abstract',
                'extends', 'from', 'this', 'super', 'constant', 'final', 'static',
                'import', 'use', 'extern', 'inline', 'proto', 'break', 'continue',
                'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'as', 'in',
                'version', 'return', 'true', 'false', 'null',
                '__VERSION__', '__MAJOR__', '__MINOR__', '__BUILD__', '__REAL_VERSION__',
                '__REAL_MAJOR__', '__REAL_MINOR__', '__REAL_BUILD__', '__DATE__', '__TIME__',
                '__FILE__', '__DIR__', '__LINE__', '__AUTO_BIGNUM__', '__NT__', '__PIKE__',
                '__amigaos__', '_Pragma', 'static_assert', 'defined', 'sscanf'), suffix=r'\b'),
             Keyword),
            (r'(bool|int|long|float|short|double|char|string|object|void|mapping|'
             r'array|multiset|program|function|lambda|mixed|'
             r'[a-z_][a-z0-9_]*_t)\b',
             Keyword.Type),
            (r'(class)(\s+)', bygroups(Keyword, Whitespace), 'classname'),
            (r'[~!%^&*+=|?:<>/@-]', Operator),
            inherit,
        ],
        'classname': [
            (r'[a-zA-Z_]\w*', Name.Class, '#pop'),
            # template specification
            (r'\s*(?=>)', Whitespace, '#pop'),
        ],
    }


class NesCLexer(CLexer):
    """
    For `nesC <https://github.com/tinyos/nesc>`_ source code with preprocessor
    directives.
    """
    name = 'nesC'
    aliases = ['nesc']
    filenames = ['*.nc']
    mimetypes = ['text/x-nescsrc']
    version_added = '2.0'

    tokens = {
        'statements': [
            (words((
                'abstract', 'as', 'async', 'atomic', 'call', 'command', 'component',
                'components', 'configuration', 'event', 'extends', 'generic',
                'implementation', 'includes', 'interface', 'module', 'new', 'norace',
                'post', 'provides', 'signal', 'task', 'uses'), suffix=r'\b'),
             Keyword),
            (words(('nx_struct', 'nx_union', 'nx_int8_t', 'nx_int16_t', 'nx_int32_t',
                    'nx_int64_t', 'nx_uint8_t', 'nx_uint16_t', 'nx_uint32_t',
                    'nx_uint64_t'), suffix=r'\b'),
             Keyword.Type),
            inherit,
        ],
    }


class ClayLexer(RegexLexer):
    """
    For Clay source.
    """
    name = 'Clay'
    filenames = ['*.clay']
    aliases = ['clay']
    mimetypes = ['text/x-clay']
    url = 'http://claylabs.com/clay'
    version_added = '2.0'

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'//.*?$', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
            (r'\b(public|private|import|as|record|variant|instance'
             r'|define|overload|default|external|alias'
             r'|rvalue|ref|forward|inline|noinline|forceinline'
             r'|enum|var|and|or|not|if|else|goto|return|while'
             r'|switch|case|break|continue|for|in|true|false|try|catch|throw'
             r'|finally|onerror|staticassert|eval|when|newtype'
             r'|__FILE__|__LINE__|__COLUMN__|__ARG__'
             r')\b', Keyword),
            (r'[~!%^&*+=|:<>/-]', Operator),
            (r'[#(){}\[\],;.]', Punctuation),
            (r'0x[0-9a-fA-F]+[LlUu]*', Number.Hex),
            (r'\d+[LlUu]*', Number.Integer),
            (r'\b(true|false)\b', Name.Builtin),
            (r'(?i)[a-z_?][\w?]*', Name),
            (r'"""', String, 'tdqs'),
            (r'"', String, 'dqs'),
        ],
        'strings': [
            (r'(?i)\\(x[0-9a-f]{2}|.)', String.Escape),
            (r'[^\\"]+', String),
        ],
        'nl': [
            (r'\n', String),
        ],
        'dqs': [
            (r'"', String, '#pop'),
            include('strings'),
        ],
        'tdqs': [
            (r'"""', String, '#pop'),
            include('strings'),
            include('nl'),
        ],
    }


class ECLexer(CLexer):
    """
    For eC source code with preprocessor directives.
    """
    name = 'eC'
    aliases = ['ec']
    filenames = ['*.ec', '*.eh']
    mimetypes = ['text/x-echdr', 'text/x-ecsrc']
    url = 'https://ec-lang.org'
    version_added = '1.5'

    tokens = {
        'statements': [
            (words((
                'virtual', 'class', 'private', 'public', 'property', 'import',
                'delete', 'new', 'new0', 'renew', 'renew0', 'define', 'get',
                'set', 'remote', 'dllexport', 'dllimport', 'stdcall', 'subclass',
                '__on_register_module', 'namespace', 'using', 'typed_object',
                'any_object', 'incref', 'register', 'watch', 'stopwatching', 'firewatchers',
                'watchable', 'class_designer', 'class_fixed', 'class_no_expansion', 'isset',
                'class_default_property', 'property_category', 'class_data',
                'class_property', 'thisclass', 'dbtable', 'dbindex',
                'database_open', 'dbfield'), suffix=r'\b'), Keyword),
            (words(('uint', 'uint16', 'uint32', 'uint64', 'bool', 'byte',
                    'unichar', 'int64'), suffix=r'\b'),
             Keyword.Type),
            (r'(class)(\s+)', bygroups(Keyword, Whitespace), 'classname'),
            (r'(null|value|this)\b', Name.Builtin),
            inherit,
        ]
    }


class ValaLexer(RegexLexer):
    """
    For Vala source code with preprocessor directives.
    """
    name = 'Vala'
    aliases = ['vala', 'vapi']
    filenames = ['*.vala', '*.vapi']
    mimetypes = ['text/x-vala']
    url = 'https://vala.dev'
    version_added = '1.1'

    tokens = {
        'whitespace': [
            (r'^\s*#if\s+0', Comment.Preproc, 'if0'),
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
            (r'\\\n', Text),  # line continuation
            (r'//(\n|(.|\n)*?[^\\]\n)', Comment.Single),
            (r'/(\\\n)?[*](.|\n)*?[*](\\\n)?/', Comment.Multiline),
        ],
        'statements': [
            (r'[L@]?"', String, 'string'),
            (r"L?'(\\.|\\[0-7]{1,3}|\\x[a-fA-F0-9]{1,2}|[^\\\'\n])'",
             String.Char),
            (r'(?s)""".*?"""', String),  # verbatim strings
            (r'(\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+[lL]?', Number.Float),
            (r'(\d+\.\d*|\.\d+|\d+[fF])[fF]?', Number.Float),
            (r'0x[0-9a-fA-F]+[Ll]?', Number.Hex),
            (r'0[0-7]+[Ll]?', Number.Oct),
            (r'\d+[Ll]?', Number.Integer),
            (r'[~!%^&*+=|?:<>/-]', Operator),
            (r'(\[)(Compact|Immutable|(?:Boolean|Simple)Type)(\])',
             bygroups(Punctuation, Name.Decorator, Punctuation)),
            # TODO: "correctly" parse complex code attributes
            (r'(\[)(CCode|(?:Integer|Floating)Type)',
             bygroups(Punctuation, Name.Decorator)),
            (r'[()\[\],.]', Punctuation),
            (words((
                'as', 'base', 'break', 'case', 'catch', 'construct', 'continue',
                'default', 'delete', 'do', 'else', 'enum', 'finally', 'for',
                'foreach', 'get', 'if', 'in', 'is', 'lock', 'new', 'out', 'params',
                'return', 'set', 'sizeof', 'switch', 'this', 'throw', 'try',
                'typeof', 'while', 'yield'), suffix=r'\b'),
             Keyword),
            (words((
                'abstract', 'const', 'delegate', 'dynamic', 'ensures', 'extern',
                'inline', 'internal', 'override', 'owned', 'private', 'protected',
                'public', 'ref', 'requires', 'signal', 'static', 'throws', 'unowned',
                'var', 'virtual', 'volatile', 'weak', 'yields'), suffix=r'\b'),
             Keyword.Declaration),
            (r'(namespace|using)(\s+)', bygroups(Keyword.Namespace, Whitespace),
             'namespace'),
            (r'(class|errordomain|interface|struct)(\s+)',
             bygroups(Keyword.Declaration, Whitespace), 'class'),
            (r'(\.)([a-zA-Z_]\w*)',
             bygroups(Operator, Name.Attribute)),
            # void is an actual keyword, others are in glib-2.0.vapi
            (words((
                'void', 'bool', 'char', 'double', 'float', 'int', 'int8', 'int16',
                'int32', 'int64', 'long', 'short', 'size_t', 'ssize_t', 'string',
                'time_t', 'uchar', 'uint', 'uint8', 'uint16', 'uint32', 'uint64',
                'ulong', 'unichar', 'ushort'), suffix=r'\b'),
             Keyword.Type),
            (r'(true|false|null)\b', Name.Builtin),
            (r'[a-zA-Z_]\w*', Name),
        ],
        'root': [
            include('whitespace'),
            default('statement'),
        ],
        'statement': [
            include('whitespace'),
            include('statements'),
            ('[{}]', Punctuation),
            (';', Punctuation, '#pop'),
        ],
        'string': [
            (r'"', String, '#pop'),
            (r'\\([\\abfnrtv"\']|x[a-fA-F0-9]{2,4}|[0-7]{1,3})', String.Escape),
            (r'[^\\"\n]+', String),  # all other characters
            (r'\\\n', String),  # line continuation
            (r'\\', String),  # stray backslash
        ],
        'if0': [
            (r'^\s*#if.*?(?<!\\)\n', Comment.Preproc, '#push'),
            (r'^\s*#el(?:se|if).*\n', Comment.Preproc, '#pop'),
            (r'^\s*#endif.*?(?<!\\)\n', Comment.Preproc, '#pop'),
            (r'.*?\n', Comment),
        ],
        'class': [
            (r'[a-zA-Z_]\w*', Name.Class, '#pop')
        ],
        'namespace': [
            (r'[a-zA-Z_][\w.]*', Name.Namespace, '#pop')
        ],
    }


class CudaLexer(CLexer):
    """
    For NVIDIA CUDA™ source.
    """
    name = 'CUDA'
    filenames = ['*.cu', '*.cuh']
    aliases = ['cuda', 'cu']
    mimetypes = ['text/x-cuda']
    url = 'https://developer.nvidia.com/category/zone/cuda-zone'
    version_added = '1.6'

    function_qualifiers = {'__device__', '__global__', '__host__',
                           '__noinline__', '__forceinline__'}
    variable_qualifiers = {'__device__', '__constant__', '__shared__',
                           '__restrict__'}
    vector_types = {'char1', 'uchar1', 'char2', 'uchar2', 'char3', 'uchar3',
                    'char4', 'uchar4', 'short1', 'ushort1', 'short2', 'ushort2',
                    'short3', 'ushort3', 'short4', 'ushort4', 'int1', 'uint1',
                    'int2', 'uint2', 'int3', 'uint3', 'int4', 'uint4', 'long1',
                    'ulong1', 'long2', 'ulong2', 'long3', 'ulong3', 'long4',
                    'ulong4', 'longlong1', 'ulonglong1', 'longlong2',
                    'ulonglong2', 'float1', 'float2', 'float3', 'float4',
                    'double1', 'double2', 'dim3'}
    variables = {'gridDim', 'blockIdx', 'blockDim', 'threadIdx', 'warpSize'}
    functions = {'__threadfence_block', '__threadfence', '__threadfence_system',
                 '__syncthreads', '__syncthreads_count', '__syncthreads_and',
                 '__syncthreads_or'}
    execution_confs = {'<<<', '>>>'}

    def get_tokens_unprocessed(self, text, stack=('root',)):
        for index, token, value in CLexer.get_tokens_unprocessed(self, text, stack):
            if token is Name:
                if value in self.variable_qualifiers:
                    token = Keyword.Type
                elif value in self.vector_types:
                    token = Keyword.Type
                elif value in self.variables:
                    token = Name.Builtin
                elif value in self.execution_confs:
                    token = Keyword.Pseudo
                elif value in self.function_qualifiers:
                    token = Keyword.Reserved
                elif value in self.functions:
                    token = Name.Function
            yield index, token, value


class SwigLexer(CppLexer):
    """
    For `SWIG <http://www.swig.org/>`_ source code.
    """
    name = 'SWIG'
    aliases = ['swig']
    filenames = ['*.swg', '*.i']
    mimetypes = ['text/swig']
    version_added = '2.0'
    priority = 0.04  # Lower than C/C++ and Objective C/C++

    tokens = {
        'root': [
            # Match it here so it won't be matched as a function in the rest of root
            (r'\$\**\&?\w+', Name),
            inherit
        ],
        'statements': [
            # SWIG directives
            (r'(%[a-z_][a-z0-9_]*)', Name.Function),
            # Special variables
            (r'\$\**\&?\w+', Name),
            # Stringification / additional preprocessor directives
            (r'##*[a-zA-Z_]\w*', Comment.Preproc),
            inherit,
        ],
    }

    # This is a far from complete set of SWIG directives
    swig_directives = {
        # Most common directives
        '%apply', '%define', '%director', '%enddef', '%exception', '%extend',
        '%feature', '%fragment', '%ignore', '%immutable', '%import', '%include',
        '%inline', '%insert', '%module', '%newobject', '%nspace', '%pragma',
        '%rename', '%shared_ptr', '%template', '%typecheck', '%typemap',
        # Less common directives
        '%arg', '%attribute', '%bang', '%begin', '%callback', '%catches', '%clear',
        '%constant', '%copyctor', '%csconst', '%csconstvalue', '%csenum',
        '%csmethodmodifiers', '%csnothrowexception', '%default', '%defaultctor',
        '%defaultdtor', '%defined', '%delete', '%delobject', '%descriptor',
        '%exceptionclass', '%exceptionvar', '%extend_smart_pointer', '%fragments',
        '%header', '%ifcplusplus', '%ignorewarn', '%implicit', '%implicitconv',
        '%init', '%javaconst', '%javaconstvalue', '%javaenum', '%javaexception',
        '%javamethodmodifiers', '%kwargs', '%luacode', '%mutable', '%naturalvar',
        '%nestedworkaround', '%perlcode', '%pythonabc', '%pythonappend',
        '%pythoncallback', '%pythoncode', '%pythondynamic', '%pythonmaybecall',
        '%pythonnondynamic', '%pythonprepend', '%refobject', '%shadow', '%sizeof',
        '%trackobjects', '%types', '%unrefobject', '%varargs', '%warn',
        '%warnfilter'}

    def analyse_text(text):
        rv = 0
        # Search for SWIG directives, which are conventionally at the beginning of
        # a line. The probability of them being within a line is low, so let another
        # lexer win in this case.
        matches = re.findall(r'^\s*(%[a-z_][a-z0-9_]*)', text, re.M)
        for m in matches:
            if m in SwigLexer.swig_directives:
                rv = 0.98
                break
            else:
                rv = 0.91  # Fraction higher than MatlabLexer
        return rv


class MqlLexer(CppLexer):
    """
    For `MQL4 <http://docs.mql4.com/>`_ and
    `MQL5 <http://www.mql5.com/en/docs>`_ source code.
    """
    name = 'MQL'
    aliases = ['mql', 'mq4', 'mq5', 'mql4', 'mql5']
    filenames = ['*.mq4', '*.mq5', '*.mqh']
    mimetypes = ['text/x-mql']
    version_added = '2.0'

    tokens = {
        'statements': [
            (words(_mql_builtins.keywords, suffix=r'\b'), Keyword),
            (words(_mql_builtins.c_types, suffix=r'\b'), Keyword.Type),
            (words(_mql_builtins.types, suffix=r'\b'), Name.Function),
            (words(_mql_builtins.constants, suffix=r'\b'), Name.Constant),
            (words(_mql_builtins.colors, prefix='(clr)?', suffix=r'\b'),
             Name.Constant),
            inherit,
        ],
    }


class ArduinoLexer(CppLexer):
    """
    For `Arduino(tm) <https://arduino.cc/>`_ source.

    This is an extension of the CppLexer, as the Arduino® Language is a superset
    of C++
    """

    name = 'Arduino'
    aliases = ['arduino']
    filenames = ['*.ino']
    mimetypes = ['text/x-arduino']
    version_added = '2.1'

    # Language sketch main structure functions
    structure = {'setup', 'loop'}

    # Language operators
    operators = {'not', 'or', 'and', 'xor'}

    # Language 'variables'
    variables = {
        'DIGITAL_MESSAGE', 'FIRMATA_STRING', 'ANALOG_MESSAGE', 'REPORT_DIGITAL',
        'REPORT_ANALOG', 'INPUT_PULLUP', 'SET_PIN_MODE', 'INTERNAL2V56', 'SYSTEM_RESET',
        'LED_BUILTIN', 'INTERNAL1V1', 'SYSEX_START', 'INTERNAL', 'EXTERNAL', 'HIGH',
        'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'true', 'false',
        'void', 'boolean', 'char', 'unsigned char', 'byte', 'int', 'unsigned int',
        'word', 'long', 'unsigned long', 'short', 'float', 'double', 'string', 'String',
        'array', 'static', 'volatile', 'const', 'boolean', 'byte', 'word', 'string',
        'String', 'array', 'int', 'float', 'private', 'char', 'virtual', 'operator',
        'sizeof', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t',
        'int32_t', 'int64_t', 'dynamic_cast', 'typedef', 'const_cast', 'const',
        'struct', 'static_cast', 'union', 'unsigned', 'long', 'volatile', 'static',
        'protected', 'bool', 'public', 'friend', 'auto', 'void', 'enum', 'extern',
        'class', 'short', 'reinterpret_cast', 'double', 'register', 'explicit',
        'signed', 'inline', 'delete', '_Bool', 'complex', '_Complex', '_Imaginary',
        'atomic_bool', 'atomic_char', 'atomic_schar', 'atomic_uchar', 'atomic_short',
        'atomic_ushort', 'atomic_int', 'atomic_uint', 'atomic_long', 'atomic_ulong',
        'atomic_llong', 'atomic_ullong', 'PROGMEM'}

    # Language shipped functions and class ( )
    functions = {
        'KeyboardController', 'MouseController', 'SoftwareSerial', 'EthernetServer',
        'EthernetClient', 'LiquidCrystal', 'RobotControl', 'GSMVoiceCall',
        'EthernetUDP', 'EsploraTFT', 'HttpClient', 'RobotMotor', 'WiFiClient',
        'GSMScanner', 'FileSystem', 'Scheduler', 'GSMServer', 'YunClient', 'YunServer',
        'IPAddress', 'GSMClient', 'GSMModem', 'Keyboard', 'Ethernet', 'Console',
        'GSMBand', 'Esplora', 'Stepper', 'Process', 'WiFiUDP', 'GSM_SMS', 'Mailbox',
        'USBHost', 'Firmata', 'PImage', 'Client', 'Server', 'GSMPIN', 'FileIO',
        'Bridge', 'Serial', 'EEPROM', 'Stream', 'Mouse', 'Audio', 'Servo', 'File',
        'Task', 'GPRS', 'WiFi', 'Wire', 'TFT', 'GSM', 'SPI', 'SD',
        'runShellCommandAsynchronously', 'analogWriteResolution',
        'retrieveCallingNumber', 'printFirmwareVersion', 'analogReadResolution',
        'sendDigitalPortPair', 'noListenOnLocalhost', 'readJoystickButton',
        'setFirmwareVersion', 'readJoystickSwitch', 'scrollDisplayRight',
        'getVoiceCallStatus', 'scrollDisplayLeft', 'writeMicroseconds',
        'delayMicroseconds', 'beginTransmission', 'getSignalStrength',
        'runAsynchronously', 'getAsynchronously', 'listenOnLocalhost',
        'getCurrentCarrier', 'readAccelerometer', 'messageAvailable',
        'sendDigitalPorts', 'lineFollowConfig', 'countryNameWrite', 'runShellCommand',
        'readStringUntil', 'rewindDirectory', 'readTemperature', 'setClockDivider',
        'readLightSensor', 'endTransmission', 'analogReference', 'detachInterrupt',
        'countryNameRead', 'attachInterrupt', 'encryptionType', 'readBytesUntil',
        'robotNameWrite', 'readMicrophone', 'robotNameRead', 'cityNameWrite',
        'userNameWrite', 'readJoystickY', 'readJoystickX', 'mouseReleased',
        'openNextFile', 'scanNetworks', 'noInterrupts', 'digitalWrite', 'beginSpeaker',
        'mousePressed', 'isActionDone', 'mouseDragged', 'displayLogos', 'noAutoscroll',
        'addParameter', 'remoteNumber', 'getModifiers', 'keyboardRead', 'userNameRead',
        'waitContinue', 'processInput', 'parseCommand', 'printVersion', 'readNetworks',
        'writeMessage', 'blinkVersion', 'cityNameRead', 'readMessage', 'setDataMode',
        'parsePacket', 'isListening', 'setBitOrder', 'beginPacket', 'isDirectory',
        'motorsWrite', 'drawCompass', 'digitalRead', 'clearScreen', 'serialEvent',
        'rightToLeft', 'setTextSize', 'leftToRight', 'requestFrom', 'keyReleased',
        'compassRead', 'analogWrite', 'interrupts', 'WiFiServer', 'disconnect',
        'playMelody', 'parseFloat', 'autoscroll', 'getPINUsed', 'setPINUsed',
        'setTimeout', 'sendAnalog', 'readSlider', 'analogRead', 'beginWrite',
        'createChar', 'motorsStop', 'keyPressed', 'tempoWrite', 'readButton',
        'subnetMask', 'debugPrint', 'macAddress', 'writeGreen', 'randomSeed',
        'attachGPRS', 'readString', 'sendString', 'remotePort', 'releaseAll',
        'mouseMoved', 'background', 'getXChange', 'getYChange', 'answerCall',
        'getResult', 'voiceCall', 'endPacket', 'constrain', 'getSocket', 'writeJSON',
        'getButton', 'available', 'connected', 'findUntil', 'readBytes', 'exitValue',
        'readGreen', 'writeBlue', 'startLoop', 'IPAddress', 'isPressed', 'sendSysex',
        'pauseMode', 'gatewayIP', 'setCursor', 'getOemKey', 'tuneWrite', 'noDisplay',
        'loadImage', 'switchPIN', 'onRequest', 'onReceive', 'changePIN', 'playFile',
        'noBuffer', 'parseInt', 'overflow', 'checkPIN', 'knobRead', 'beginTFT',
        'bitClear', 'updateIR', 'bitWrite', 'position', 'writeRGB', 'highByte',
        'writeRed', 'setSpeed', 'readBlue', 'noStroke', 'remoteIP', 'transfer',
        'shutdown', 'hangCall', 'beginSMS', 'endWrite', 'attached', 'maintain',
        'noCursor', 'checkReg', 'checkPUK', 'shiftOut', 'isValid', 'shiftIn', 'pulseIn',
        'connect', 'println', 'localIP', 'pinMode', 'getIMEI', 'display', 'noBlink',
        'process', 'getBand', 'running', 'beginSD', 'drawBMP', 'lowByte', 'setBand',
        'release', 'bitRead', 'prepare', 'pointTo', 'readRed', 'setMode', 'noFill',
        'remove', 'listen', 'stroke', 'detach', 'attach', 'noTone', 'exists', 'buffer',
        'height', 'bitSet', 'circle', 'config', 'cursor', 'random', 'IRread', 'setDNS',
        'endSMS', 'getKey', 'micros', 'millis', 'begin', 'print', 'write', 'ready',
        'flush', 'width', 'isPIN', 'blink', 'clear', 'press', 'mkdir', 'rmdir', 'close',
        'point', 'yield', 'image', 'BSSID', 'click', 'delay', 'read', 'text', 'move',
        'peek', 'beep', 'rect', 'line', 'open', 'seek', 'fill', 'size', 'turn', 'stop',
        'home', 'find', 'step', 'tone', 'sqrt', 'RSSI', 'SSID', 'end', 'bit', 'tan',
        'cos', 'sin', 'pow', 'map', 'abs', 'max', 'min', 'get', 'run', 'put',
        'isAlphaNumeric', 'isAlpha', 'isAscii', 'isWhitespace', 'isControl', 'isDigit',
        'isGraph', 'isLowerCase', 'isPrintable', 'isPunct', 'isSpace', 'isUpperCase',
        'isHexadecimalDigit'}

    # do not highlight
    suppress_highlight = {
        'namespace', 'template', 'mutable', 'using', 'asm', 'typeid',
        'typename', 'this', 'alignof', 'constexpr', 'decltype', 'noexcept',
        'static_assert', 'thread_local', 'restrict'}

    def get_tokens_unprocessed(self, text, stack=('root',)):
        for index, token, value in CppLexer.get_tokens_unprocessed(self, text, stack):
            if value in self.structure:
                yield index, Name.Builtin, value
            elif value in self.operators:
                yield index, Operator, value
            elif value in self.variables:
                yield index, Keyword.Reserved, value
            elif value in self.suppress_highlight:
                yield index, Name, value
            elif value in self.functions:
                yield index, Name.Function, value
            else:
                yield index, token, value


class CharmciLexer(CppLexer):
    """
    For `Charm++ <https://charm.cs.illinois.edu>`_ interface files (.ci).
    """

    name = 'Charmci'
    aliases = ['charmci']
    filenames = ['*.ci']
    version_added = '2.4'

    mimetypes = []

    tokens = {
        'keywords': [
            (r'(module)(\s+)', bygroups(Keyword, Text), 'classname'),
            (words(('mainmodule', 'mainchare', 'chare', 'array', 'group',
                    'nodegroup', 'message', 'conditional')), Keyword),
            (words(('entry', 'aggregate', 'threaded', 'sync', 'exclusive',
                    'nokeep', 'notrace', 'immediate', 'expedited', 'inline',
                    'local', 'python', 'accel', 'readwrite', 'writeonly',
                    'accelblock', 'memcritical', 'packed', 'varsize',
                    'initproc', 'initnode', 'initcall', 'stacksize',
                    'createhere', 'createhome', 'reductiontarget', 'iget',
                    'nocopy', 'mutable', 'migratable', 'readonly')), Keyword),
            inherit,
        ],
    }


class OmgIdlLexer(CLexer):
    """
    Lexer for Object Management Group Interface Definition Language.
    """

    name = 'OMG Interface Definition Language'
    url = 'https://www.omg.org/spec/IDL/About-IDL/'
    aliases = ['omg-idl']
    filenames = ['*.idl', '*.pidl']
    mimetypes = []
    version_added = '2.9'

    scoped_name = r'((::)?\w+)+'

    tokens = {
        'values': [
            (words(('true', 'false'), prefix=r'(?i)', suffix=r'\b'), Number),
            (r'([Ll]?)(")', bygroups(String.Affix, String.Double), 'string'),
            (r'([Ll]?)(\')(\\[^\']+)(\')',
                bygroups(String.Affix, String.Char, String.Escape, String.Char)),
            (r'([Ll]?)(\')(\\\')(\')',
                bygroups(String.Affix, String.Char, String.Escape, String.Char)),
            (r'([Ll]?)(\'.\')', bygroups(String.Affix, String.Char)),
            (r'[+-]?\d+(\.\d*)?[Ee][+-]?\d+', Number.Float),
            (r'[+-]?(\d+\.\d*)|(\d*\.\d+)([Ee][+-]?\d+)?', Number.Float),
            (r'(?i)[+-]?0x[0-9a-f]+', Number.Hex),
            (r'[+-]?[1-9]\d*', Number.Integer),
            (r'[+-]?0[0-7]*', Number.Oct),
            (r'[\+\-\*\/%^&\|~]', Operator),
            (words(('<<', '>>')), Operator),
            (scoped_name, Name),
            (r'[{};:,<>\[\]]', Punctuation),
        ],
        'annotation_params': [
            include('whitespace'),
            (r'\(', Punctuation, '#push'),
            include('values'),
            (r'=', Punctuation),
            (r'\)', Punctuation, '#pop'),
        ],
        'annotation_params_maybe': [
            (r'\(', Punctuation, 'annotation_params'),
            include('whitespace'),
            default('#pop'),
        ],
        'annotation_appl': [
            (r'@' + scoped_name, Name.Decorator, 'annotation_params_maybe'),
        ],
        'enum': [
            include('whitespace'),
            (r'[{,]', Punctuation),
            (r'\w+', Name.Constant),
            include('annotation_appl'),
            (r'\}', Punctuation, '#pop'),
        ],
        'root': [
            include('whitespace'),
            (words((
                'typedef', 'const',
                'in', 'out', 'inout', 'local',
            ), prefix=r'(?i)', suffix=r'\b'), Keyword.Declaration),
            (words((
                'void', 'any', 'native', 'bitfield',
                'unsigned', 'boolean', 'char', 'wchar', 'octet', 'short', 'long',
                'int8', 'uint8', 'int16', 'int32', 'int64', 'uint16', 'uint32', 'uint64',
                'float', 'double', 'fixed',
                'sequence', 'string', 'wstring', 'map',
            ), prefix=r'(?i)', suffix=r'\b'), Keyword.Type),
            (words((
                '@annotation', 'struct', 'union', 'bitset', 'interface',
                'exception', 'valuetype', 'eventtype', 'component',
            ), prefix=r'(?i)', suffix=r'(\s+)(\w+)'), bygroups(Keyword, Whitespace, Name.Class)),
            (words((
                'abstract', 'alias', 'attribute', 'case', 'connector',
                'consumes', 'context', 'custom', 'default', 'emits', 'factory',
                'finder', 'getraises', 'home', 'import', 'manages', 'mirrorport',
                'multiple', 'Object', 'oneway', 'primarykey', 'private', 'port',
                'porttype', 'provides', 'public', 'publishes', 'raises',
                'readonly', 'setraises', 'supports', 'switch', 'truncatable',
                'typeid', 'typename', 'typeprefix', 'uses', 'ValueBase',
            ), prefix=r'(?i)', suffix=r'\b'), Keyword),
            (r'(?i)(enum|bitmask)(\s+)(\w+)',
                bygroups(Keyword, Whitespace, Name.Class), 'enum'),
            (r'(?i)(module)(\s+)(\w+)',
                bygroups(Keyword.Namespace, Whitespace, Name.Namespace)),
            (r'(\w+)(\s*)(=)', bygroups(Name.Constant, Whitespace, Operator)),
            (r'[\(\)]', Punctuation),
            include('values'),
            include('annotation_appl'),
        ],
    }


class PromelaLexer(CLexer):
    """
    For the Promela language used with SPIN.
    """
    
    name = 'Promela'
    aliases = ['promela']
    filenames = ['*.pml', '*.prom', '*.prm', '*.promela', '*.pr', '*.pm']
    mimetypes = ['text/x-promela']
    url = 'https://spinroot.com/spin/whatispin.html'
    version_added = '2.18'

    # Promela's language reference:
    # https://spinroot.com/spin/Man/promela.html
    # Promela's grammar definition:
    # https://spinroot.com/spin/Man/grammar.html

    tokens = {
        'statements': [
            (r'(\[\]|<>|/\\|\\/)|(U|W|V)\b', Operator), # LTL Operators
            (r'@', Punctuation), #remoterefs
            (r'(\.)([a-zA-Z_]\w*)', bygroups(Operator, Name.Attribute)),
            inherit
        ],
        'types': [
            # Predefined (data types)
            (words((
                'bit', 'bool', 'byte', 'pid', 'short', 'int', 'unsigned'),
                suffix=r'\b'),
             Keyword.Type),
        ],
        'keywords': [
            # ControlFlow
            (words((
                'atomic', 'break', 'd_step', 'do', 'od', 'for', 'in', 'goto',
                'if', 'fi', 'unless'), suffix=r'\b'),
             Keyword),
            # BasicStatements
            (words((
                'assert', 'get_priority', 'printf', 'printm', 'set_priority'),
                suffix=r'\b'),
             Name.Function),
            # Embedded C Code
            (words((
                'c_code', 'c_decl', 'c_expr', 'c_state', 'c_track'),
                suffix=r'\b'),
             Keyword),
            # Predefined (local/global variables)
            (words((
                '_', '_last', '_nr_pr', '_pid', '_priority', 'else', 'np_',
                'STDIN'), suffix=r'\b'),
             Name.Builtin),
            # Predefined (functions)
            (words((
                'empty', 'enabled', 'eval', 'full', 'len', 'nempty', 'nfull',
                'pc_value'), suffix=r'\b'),
             Name.Function),
            # Predefined (operators)
            (r'run\b', Operator.Word),
            # Declarators
            (words((
                'active', 'chan', 'D_proctype', 'hidden', 'init', 'local',
                'mtype', 'never', 'notrace', 'proctype', 'show', 'trace',
                'typedef', 'xr', 'xs'), suffix=r'\b'),
             Keyword.Declaration),
            # Declarators (suffixes)
            (words((
                'priority', 'provided'), suffix=r'\b'),
             Keyword),
            # MetaTerms (declarators)
            (words((
                'inline', 'ltl', 'select'), suffix=r'\b'),
             Keyword.Declaration),
            # MetaTerms (keywords)
            (r'skip\b', Keyword),
        ],
    }
