"""
    pygments.lexers._lua_builtins
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    This file contains the names and modules of lua functions
    It is able to re-generate itself, but for adding new functions you
    probably have to add some callbacks (see function module_callbacks).

    Do not edit the MODULES dict by hand.

    Run with `python -I` to regenerate.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

MODULES = {'basic': ('_G',
           '_VERSION',
           'assert',
           'collectgarbage',
           'dofile',
           'error',
           'getmetatable',
           'ipairs',
           'load',
           'loadfile',
           'next',
           'pairs',
           'pcall',
           'print',
           'rawequal',
           'rawget',
           'rawlen',
           'rawset',
           'select',
           'setmetatable',
           'tonumber',
           'tostring',
           'type',
           'warn',
           'xpcall'),
 'bit32': ('bit32.arshift',
           'bit32.band',
           'bit32.bnot',
           'bit32.bor',
           'bit32.btest',
           'bit32.bxor',
           'bit32.extract',
           'bit32.lrotate',
           'bit32.lshift',
           'bit32.replace',
           'bit32.rrotate',
           'bit32.rshift'),
 'coroutine': ('coroutine.close',
               'coroutine.create',
               'coroutine.isyieldable',
               'coroutine.resume',
               'coroutine.running',
               'coroutine.status',
               'coroutine.wrap',
               'coroutine.yield'),
 'debug': ('debug.debug',
           'debug.gethook',
           'debug.getinfo',
           'debug.getlocal',
           'debug.getmetatable',
           'debug.getregistry',
           'debug.getupvalue',
           'debug.getuservalue',
           'debug.sethook',
           'debug.setlocal',
           'debug.setmetatable',
           'debug.setupvalue',
           'debug.setuservalue',
           'debug.traceback',
           'debug.upvalueid',
           'debug.upvaluejoin'),
 'io': ('io.close',
        'io.flush',
        'io.input',
        'io.lines',
        'io.open',
        'io.output',
        'io.popen',
        'io.read',
        'io.stderr',
        'io.stdin',
        'io.stdout',
        'io.tmpfile',
        'io.type',
        'io.write'),
 'math': ('math.abs',
          'math.acos',
          'math.asin',
          'math.atan',
          'math.atan2',
          'math.ceil',
          'math.cos',
          'math.cosh',
          'math.deg',
          'math.exp',
          'math.floor',
          'math.fmod',
          'math.frexp',
          'math.huge',
          'math.ldexp',
          'math.log',
          'math.max',
          'math.maxinteger',
          'math.min',
          'math.mininteger',
          'math.modf',
          'math.pi',
          'math.pow',
          'math.rad',
          'math.random',
          'math.randomseed',
          'math.sin',
          'math.sinh',
          'math.sqrt',
          'math.tan',
          'math.tanh',
          'math.tointeger',
          'math.type',
          'math.ult'),
 'modules': ('package.config',
             'package.cpath',
             'package.loaded',
             'package.loadlib',
             'package.path',
             'package.preload',
             'package.searchers',
             'package.searchpath',
             'require'),
 'os': ('os.clock',
        'os.date',
        'os.difftime',
        'os.execute',
        'os.exit',
        'os.getenv',
        'os.remove',
        'os.rename',
        'os.setlocale',
        'os.time',
        'os.tmpname'),
 'string': ('string.byte',
            'string.char',
            'string.dump',
            'string.find',
            'string.format',
            'string.gmatch',
            'string.gsub',
            'string.len',
            'string.lower',
            'string.match',
            'string.pack',
            'string.packsize',
            'string.rep',
            'string.reverse',
            'string.sub',
            'string.unpack',
            'string.upper'),
 'table': ('table.concat',
           'table.insert',
           'table.move',
           'table.pack',
           'table.remove',
           'table.sort',
           'table.unpack'),
 'utf8': ('utf8.char',
          'utf8.charpattern',
          'utf8.codepoint',
          'utf8.codes',
          'utf8.len',
          'utf8.offset')}

if __name__ == '__main__':  # pragma: no cover
    import re
    from urllib.request import urlopen
    import pprint

    # you can't generally find out what module a function belongs to if you
    # have only its name. Because of this, here are some callback functions
    # that recognize if a gioven function belongs to a specific module
    def module_callbacks():
        def is_in_coroutine_module(name):
            return name.startswith('coroutine.')

        def is_in_modules_module(name):
            if name in ['require', 'module'] or name.startswith('package'):
                return True
            else:
                return False

        def is_in_string_module(name):
            return name.startswith('string.')

        def is_in_table_module(name):
            return name.startswith('table.')

        def is_in_math_module(name):
            return name.startswith('math')

        def is_in_io_module(name):
            return name.startswith('io.')

        def is_in_os_module(name):
            return name.startswith('os.')

        def is_in_debug_module(name):
            return name.startswith('debug.')

        return {'coroutine': is_in_coroutine_module,
                'modules': is_in_modules_module,
                'string': is_in_string_module,
                'table': is_in_table_module,
                'math': is_in_math_module,
                'io': is_in_io_module,
                'os': is_in_os_module,
                'debug': is_in_debug_module}



    def get_newest_version():
        f = urlopen('http://www.lua.org/manual/')
        r = re.compile(r'^<A HREF="(\d\.\d)/">(Lua )?\1</A>')
        for line in f:
            m = r.match(line.decode('iso-8859-1'))
            if m is not None:
                return m.groups()[0]

    def get_lua_functions(version):
        f = urlopen(f'http://www.lua.org/manual/{version}/')
        r = re.compile(r'^<A HREF="manual.html#pdf-(?!lua|LUA)([^:]+)">\1</A>')
        functions = []
        for line in f:
            m = r.match(line.decode('iso-8859-1'))
            if m is not None:
                functions.append(m.groups()[0])
        return functions

    def get_function_module(name):
        for mod, cb in module_callbacks().items():
            if cb(name):
                return mod
        if '.' in name:
            return name.split('.')[0]
        else:
            return 'basic'

    def regenerate(filename, modules):
        with open(filename, encoding='utf-8') as fp:
            content = fp.read()

        header = content[:content.find('MODULES = {')]
        footer = content[content.find("if __name__ == '__main__':"):]


        with open(filename, 'w', encoding='utf-8') as fp:
            fp.write(header)
            fp.write(f'MODULES = {pprint.pformat(modules)}\n\n')
            fp.write(footer)

    def run():
        version = get_newest_version()
        functions = set()
        for v in ('5.2', version):
            print(f'> Downloading function index for Lua {v}')
            f = get_lua_functions(v)
            print('> %d functions found, %d new:' %
                  (len(f), len(set(f) - functions)))
            functions |= set(f)

        functions = sorted(functions)

        modules = {}
        for full_function_name in functions:
            print(f'>> {full_function_name}')
            m = get_function_module(full_function_name)
            modules.setdefault(m, []).append(full_function_name)
        modules = {k: tuple(v) for k, v in modules.items()}

        regenerate(__file__, modules)

    run()
