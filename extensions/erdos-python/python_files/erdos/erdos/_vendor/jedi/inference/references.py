import os
import re

from erdos.erdos._vendor.parso import python_bytes_to_unicode

from erdos.erdos._vendor.jedi.debug import dbg
from erdos.erdos._vendor.jedi.file_io import KnownContentFileIO, FolderIO
from erdos.erdos._vendor.jedi.inference.names import SubModuleName
from erdos.erdos._vendor.jedi.inference.imports import load_module_from_path
from erdos.erdos._vendor.jedi.inference.filters import ParserTreeFilter
from erdos.erdos._vendor.jedi.inference.gradual.conversion import convert_names

_IGNORE_FOLDERS = ('.tox', '.venv', '.mypy_cache', 'venv', '__pycache__')

_OPENED_FILE_LIMIT = 2000
"""
Stats from a 2016 Lenovo Notebook running Linux:
With os.walk, it takes about 10s to scan 11'000 files (without filesystem
caching). Once cached it only takes 5s. So it is expected that reading all
those files might take a few seconds, but not a lot more.
"""
_PARSED_FILE_LIMIT = 30
"""
For now we keep the amount of parsed files really low, since parsing might take
easily 100ms for bigger files.
"""


def _resolve_names(definition_names, avoid_names=()):
    for name in definition_names:
        if name in avoid_names:
            # Avoiding recursions here, because goto on a module name lands
            # on the same module.
            continue

        if not isinstance(name, SubModuleName):
            # SubModuleNames are not actually existing names but created
            # names when importing something like `import foo.bar.baz`.
            yield name

        if name.api_type == 'module':
            yield from _resolve_names(name.goto(), definition_names)


def _dictionarize(names):
    return dict(
        (n if n.tree_name is None else n.tree_name, n)
        for n in names
    )


def _find_defining_names(module_context, tree_name):
    found_names = _find_names(module_context, tree_name)

    for name in list(found_names):
        # Convert from/to stubs, because those might also be usages.
        found_names |= set(convert_names(
            [name],
            only_stubs=not name.get_root_context().is_stub(),
            prefer_stub_to_compiled=False
        ))

    found_names |= set(_find_global_variables(found_names, tree_name.value))
    for name in list(found_names):
        if name.api_type == 'param' or name.tree_name is None \
                or name.tree_name.parent.type == 'trailer':
            continue
        found_names |= set(_add_names_in_same_context(name.parent_context, name.string_name))
    return set(_resolve_names(found_names))


def _find_names(module_context, tree_name):
    name = module_context.create_name(tree_name)
    found_names = set(name.goto())
    found_names.add(name)

    return set(_resolve_names(found_names))


def _add_names_in_same_context(context, string_name):
    if context.tree_node is None:
        return

    until_position = None
    while True:
        filter_ = ParserTreeFilter(
            parent_context=context,
            until_position=until_position,
        )
        names = set(filter_.get(string_name))
        if not names:
            break
        yield from names
        ordered = sorted(names, key=lambda x: x.start_pos)
        until_position = ordered[0].start_pos


def _find_global_variables(names, search_name):
    for name in names:
        if name.tree_name is None:
            continue
        module_context = name.get_root_context()
        try:
            method = module_context.get_global_filter
        except AttributeError:
            continue
        else:
            for global_name in method().get(search_name):
                yield global_name
                c = module_context.create_context(global_name.tree_name)
                yield from _add_names_in_same_context(c, global_name.string_name)


def find_references(module_context, tree_name, only_in_module=False):
    inf = module_context.inference_state
    search_name = tree_name.value

    # We disable flow analysis, because if we have ifs that are only true in
    # certain cases, we want both sides.
    try:
        inf.flow_analysis_enabled = False
        found_names = _find_defining_names(module_context, tree_name)
    finally:
        inf.flow_analysis_enabled = True

    found_names_dct = _dictionarize(found_names)

    module_contexts = [module_context]
    if not only_in_module:
        for m in set(d.get_root_context() for d in found_names):
            if m != module_context and m.tree_node is not None \
                    and inf.project.path in m.py__file__().parents:
                module_contexts.append(m)
    # For param no search for other modules is necessary.
    if only_in_module or any(n.api_type == 'param' for n in found_names):
        potential_modules = module_contexts
    else:
        potential_modules = get_module_contexts_containing_name(
            inf,
            module_contexts,
            search_name,
        )

    non_matching_reference_maps = {}
    for module_context in potential_modules:
        for name_leaf in module_context.tree_node.get_used_names().get(search_name, []):
            new = _dictionarize(_find_names(module_context, name_leaf))
            if any(tree_name in found_names_dct for tree_name in new):
                found_names_dct.update(new)
                for tree_name in new:
                    for dct in non_matching_reference_maps.get(tree_name, []):
                        # A reference that was previously searched for matches
                        # with a now found name. Merge.
                        found_names_dct.update(dct)
                    try:
                        del non_matching_reference_maps[tree_name]
                    except KeyError:
                        pass
            else:
                for name in new:
                    non_matching_reference_maps.setdefault(name, []).append(new)
    result = found_names_dct.values()
    if only_in_module:
        return [n for n in result if n.get_root_context() == module_context]
    return result


def _check_fs(inference_state, file_io, regex):
    try:
        code = file_io.read()
    except FileNotFoundError:
        return None
    code = python_bytes_to_unicode(code, errors='replace')
    if not regex.search(code):
        return None
    new_file_io = KnownContentFileIO(file_io.path, code)
    m = load_module_from_path(inference_state, new_file_io)
    if m.is_compiled():
        return None
    return m.as_context()


def gitignored_paths(folder_io, file_io):
    ignored_paths_abs = set()
    ignored_paths_rel = set()

    for l in file_io.read().splitlines():
        if not l or l.startswith(b'#') or l.startswith(b'!') or b'*' in l:
            continue

        p = l.decode('utf-8', 'ignore').rstrip('/')
        if '/' in p:
            name = p.lstrip('/')
            ignored_paths_abs.add(os.path.join(folder_io.path, name))
        else:
            name = p
            ignored_paths_rel.add((folder_io.path, name))

    return ignored_paths_abs, ignored_paths_rel


def expand_relative_ignore_paths(folder_io, relative_paths):
    curr_path = folder_io.path
    return {os.path.join(curr_path, p[1]) for p in relative_paths if curr_path.startswith(p[0])}


def recurse_find_python_folders_and_files(folder_io, except_paths=()):
    except_paths = set(except_paths)
    except_paths_relative = set()

    for root_folder_io, folder_ios, file_ios in folder_io.walk():
        # Delete folders that we don't want to iterate over.
        for file_io in file_ios:
            path = file_io.path
            if path.suffix in ('.py', '.pyi'):
                if path not in except_paths:
                    yield None, file_io

            if path.name == '.gitignore':
                ignored_paths_abs, ignored_paths_rel = gitignored_paths(
                    root_folder_io, file_io
                )
                except_paths |= ignored_paths_abs
                except_paths_relative |= ignored_paths_rel

        except_paths_relative_expanded = expand_relative_ignore_paths(
            root_folder_io, except_paths_relative
        )

        folder_ios[:] = [
            folder_io
            for folder_io in folder_ios
            if folder_io.path not in except_paths
            and folder_io.path not in except_paths_relative_expanded
            and folder_io.get_base_name() not in _IGNORE_FOLDERS
        ]
        for folder_io in folder_ios:
            yield folder_io, None


def recurse_find_python_files(folder_io, except_paths=()):
    for folder_io, file_io in recurse_find_python_folders_and_files(folder_io, except_paths):
        if file_io is not None:
            yield file_io


def _find_python_files_in_sys_path(inference_state, module_contexts):
    sys_path = inference_state.get_sys_path()
    except_paths = set()
    yielded_paths = [m.py__file__() for m in module_contexts]
    for module_context in module_contexts:
        file_io = module_context.get_value().file_io
        if file_io is None:
            continue

        folder_io = file_io.get_parent_folder()
        while True:
            path = folder_io.path
            if not any(path.startswith(p) for p in sys_path) or path in except_paths:
                break
            for file_io in recurse_find_python_files(folder_io, except_paths):
                if file_io.path not in yielded_paths:
                    yield file_io
            except_paths.add(path)
            folder_io = folder_io.get_parent_folder()


def _find_project_modules(inference_state, module_contexts):
    except_ = [m.py__file__() for m in module_contexts]
    yield from recurse_find_python_files(FolderIO(inference_state.project.path), except_)


def get_module_contexts_containing_name(inference_state, module_contexts, name,
                                        limit_reduction=1):
    """
    Search a name in the directories of modules.

    :param limit_reduction: Divides the limits on opening/parsing files by this
        factor.
    """
    # Skip non python modules
    for module_context in module_contexts:
        if module_context.is_compiled():
            continue
        yield module_context

    # Very short names are not searched in other modules for now to avoid lots
    # of file lookups.
    if len(name) <= 2:
        return

    # Currently not used, because there's only `scope=project` and `scope=file`
    # At the moment there is no such thing as `scope=sys.path`.
    # file_io_iterator = _find_python_files_in_sys_path(inference_state, module_contexts)
    file_io_iterator = _find_project_modules(inference_state, module_contexts)
    yield from search_in_file_ios(inference_state, file_io_iterator, name,
                                  limit_reduction=limit_reduction)


def search_in_file_ios(inference_state, file_io_iterator, name,
                       limit_reduction=1, complete=False):
    parse_limit = _PARSED_FILE_LIMIT / limit_reduction
    open_limit = _OPENED_FILE_LIMIT / limit_reduction
    file_io_count = 0
    parsed_file_count = 0
    regex = re.compile(r'\b' + re.escape(name) + (r'' if complete else r'\b'))
    for file_io in file_io_iterator:
        file_io_count += 1
        m = _check_fs(inference_state, file_io, regex)
        if m is not None:
            parsed_file_count += 1
            yield m
            if parsed_file_count >= parse_limit:
                dbg('Hit limit of parsed files: %s', parse_limit)
                break

        if file_io_count >= open_limit:
            dbg('Hit limit of opened files: %s', open_limit)
            break
