import difflib
from pathlib import Path
from typing import Dict, Iterable, Tuple

from lotas.erdos._vendor.parso import split_lines

from lotas.erdos._vendor.jedi.api.exceptions import RefactoringError
from lotas.erdos._vendor.jedi.inference.value.namespace import ImplicitNSName

EXPRESSION_PARTS = (
    'or_test and_test not_test comparison '
    'expr xor_expr and_expr shift_expr arith_expr term factor power atom_expr'
).split()


class ChangedFile:
    def __init__(self, inference_state, from_path, to_path,
                 module_node, node_to_str_map):
        self._inference_state = inference_state
        self._from_path = from_path
        self._to_path = to_path
        self._module_node = module_node
        self._node_to_str_map = node_to_str_map

    def get_diff(self):
        old_lines = split_lines(self._module_node.get_code(), keepends=True)
        new_lines = split_lines(self.get_new_code(), keepends=True)

        # Add a newline at the end if it's missing. Otherwise the diff will be
        # very weird. A `diff -u file1 file2` would show the string:
        #
        #     \ No newline at end of file
        #
        # This is not necessary IMO, because Jedi does not really play with
        # newlines and the ending newline does not really matter in Python
        # files. ~dave
        if old_lines[-1] != '':
            old_lines[-1] += '\n'
        if new_lines[-1] != '':
            new_lines[-1] += '\n'

        project_path = self._inference_state.project.path
        if self._from_path is None:
            from_p = ''
        else:
            try:
                from_p = self._from_path.relative_to(project_path)
            except ValueError:  # Happens it the path is not on th project_path
                from_p = self._from_path
        if self._to_path is None:
            to_p = ''
        else:
            try:
                to_p = self._to_path.relative_to(project_path)
            except ValueError:
                to_p = self._to_path
        diff = difflib.unified_diff(
            old_lines, new_lines,
            fromfile=str(from_p),
            tofile=str(to_p),
        )
        # Apparently there's a space at the end of the diff - for whatever
        # reason.
        return ''.join(diff).rstrip(' ')

    def get_new_code(self):
        return self._inference_state.grammar.refactor(self._module_node, self._node_to_str_map)

    def apply(self):
        if self._from_path is None:
            raise RefactoringError(
                'Cannot apply a refactoring on a Script with path=None'
            )

        with open(self._from_path, 'w', newline='') as f:
            f.write(self.get_new_code())

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self._from_path)


class Refactoring:
    def __init__(self, inference_state, file_to_node_changes, renames=()):
        self._inference_state = inference_state
        self._renames = renames
        self._file_to_node_changes = file_to_node_changes

    def get_changed_files(self) -> Dict[Path, ChangedFile]:
        def calculate_to_path(p):
            if p is None:
                return p
            p = str(p)
            for from_, to in renames:
                if p.startswith(str(from_)):
                    p = str(to) + p[len(str(from_)):]
            return Path(p)

        renames = self.get_renames()
        return {
            path: ChangedFile(
                self._inference_state,
                from_path=path,
                to_path=calculate_to_path(path),
                module_node=next(iter(map_)).get_root_node(),
                node_to_str_map=map_
            )
            # We need to use `or`, because the path can be None
            for path, map_ in sorted(
                self._file_to_node_changes.items(),
                key=lambda x: x[0] or Path("")
            )
        }

    def get_renames(self) -> Iterable[Tuple[Path, Path]]:
        """
        Files can be renamed in a refactoring.
        """
        return sorted(self._renames)

    def get_diff(self):
        text = ''
        project_path = self._inference_state.project.path
        for from_, to in self.get_renames():
            text += 'rename from %s\nrename to %s\n' \
                % (_try_relative_to(from_, project_path), _try_relative_to(to, project_path))

        return text + ''.join(f.get_diff() for f in self.get_changed_files().values())

    def apply(self):
        """
        Applies the whole refactoring to the files, which includes renames.
        """
        for f in self.get_changed_files().values():
            f.apply()

        for old, new in self.get_renames():
            old.rename(new)


def _calculate_rename(path, new_name):
    dir_ = path.parent
    if path.name in ('__init__.py', '__init__.pyi'):
        return dir_, dir_.parent.joinpath(new_name)
    return path, dir_.joinpath(new_name + path.suffix)


def rename(inference_state, definitions, new_name):
    file_renames = set()
    file_tree_name_map = {}

    if not definitions:
        raise RefactoringError("There is no name under the cursor")

    for d in definitions:
        # This private access is ok in a way. It's not public to
        # protect Jedi users from seeing it.
        tree_name = d._name.tree_name
        if d.type == 'module' and tree_name is None and d.module_path is not None:
            p = Path(d.module_path)
            file_renames.add(_calculate_rename(p, new_name))
        elif isinstance(d._name, ImplicitNSName):
            for p in d._name._value.py__path__():
                file_renames.add(_calculate_rename(Path(p), new_name))
        else:
            if tree_name is not None:
                fmap = file_tree_name_map.setdefault(d.module_path, {})
                fmap[tree_name] = tree_name.prefix + new_name
    return Refactoring(inference_state, file_tree_name_map, file_renames)


def inline(inference_state, names):
    if not names:
        raise RefactoringError("There is no name under the cursor")
    if any(n.api_type in ('module', 'namespace') for n in names):
        raise RefactoringError("Cannot inline imports, modules or namespaces")
    if any(n.tree_name is None for n in names):
        raise RefactoringError("Cannot inline builtins/extensions")

    definitions = [n for n in names if n.tree_name.is_definition()]
    if len(definitions) == 0:
        raise RefactoringError("No definition found to inline")
    if len(definitions) > 1:
        raise RefactoringError("Cannot inline a name with multiple definitions")
    if len(names) == 1:
        raise RefactoringError("There are no references to this name")

    tree_name = definitions[0].tree_name

    expr_stmt = tree_name.get_definition()
    if expr_stmt.type != 'expr_stmt':
        type_ = dict(
            funcdef='function',
            classdef='class',
        ).get(expr_stmt.type, expr_stmt.type)
        raise RefactoringError("Cannot inline a %s" % type_)

    if len(expr_stmt.get_defined_names(include_setitem=True)) > 1:
        raise RefactoringError("Cannot inline a statement with multiple definitions")
    first_child = expr_stmt.children[1]
    if first_child.type == 'annassign' and len(first_child.children) == 4:
        first_child = first_child.children[2]
    if first_child != '=':
        if first_child.type == 'annassign':
            raise RefactoringError(
                'Cannot inline a statement that is defined by an annotation'
            )
        else:
            raise RefactoringError(
                'Cannot inline a statement with "%s"'
                % first_child.get_code(include_prefix=False)
            )

    rhs = expr_stmt.get_rhs()
    replace_code = rhs.get_code(include_prefix=False)

    references = [n for n in names if not n.tree_name.is_definition()]
    file_to_node_changes = {}
    for name in references:
        tree_name = name.tree_name
        path = name.get_root_context().py__file__()
        s = replace_code
        if rhs.type == 'testlist_star_expr' \
                or tree_name.parent.type in EXPRESSION_PARTS \
                or tree_name.parent.type == 'trailer' \
                and tree_name.parent.get_next_sibling() is not None:
            s = '(' + replace_code + ')'

        of_path = file_to_node_changes.setdefault(path, {})

        n = tree_name
        prefix = n.prefix
        par = n.parent
        if par.type == 'trailer' and par.children[0] == '.':
            prefix = par.parent.children[0].prefix
            n = par
            for some_node in par.parent.children[:par.parent.children.index(par)]:
                of_path[some_node] = ''
        of_path[n] = prefix + s

    path = definitions[0].get_root_context().py__file__()
    changes = file_to_node_changes.setdefault(path, {})
    changes[expr_stmt] = _remove_indent_of_prefix(expr_stmt.get_first_leaf().prefix)
    next_leaf = expr_stmt.get_next_leaf()

    # Most of the time we have to remove the newline at the end of the
    # statement, but if there's a comment we might not need to.
    if next_leaf.prefix.strip(' \t') == '' \
            and (next_leaf.type == 'newline' or next_leaf == ';'):
        changes[next_leaf] = ''
    return Refactoring(inference_state, file_to_node_changes)


def _remove_indent_of_prefix(prefix):
    r"""
    Removes the last indentation of a prefix, e.g. " \n \n " becomes " \n \n".
    """
    return ''.join(split_lines(prefix, keepends=True)[:-1])


def _try_relative_to(path: Path, base: Path) -> Path:
    try:
        return path.relative_to(base)
    except ValueError:
        return path
