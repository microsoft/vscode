from jedi._compatibility import unicode
from jedi.api import classes
from jedi.parser import tree
from jedi.evaluate import imports


def usages(evaluator, definition_names, mods):
    """
    :param definitions: list of Name
    """
    def compare_array(definitions):
        """ `definitions` are being compared by module/start_pos, because
        sometimes the id's of the objects change (e.g. executions).
        """
        result = []
        for d in definitions:
            module = d.get_parent_until()
            result.append((module, d.start_pos))
        return result

    search_name = unicode(list(definition_names)[0])
    compare_definitions = compare_array(definition_names)
    mods |= set([d.get_parent_until() for d in definition_names])
    definitions = []
    for m in imports.get_modules_containing_name(evaluator, mods, search_name):
        try:
            check_names = m.used_names[search_name]
        except KeyError:
            continue
        for name in check_names:

            result = evaluator.goto(name)
            if [c for c in compare_array(result) if c in compare_definitions]:
                definitions.append(classes.Definition(evaluator, name))
                # Previous definitions might be imports, so include them
                # (because goto might return that import name).
                compare_definitions += compare_array([name])
    return definitions


def usages_add_import_modules(evaluator, definitions):
    """ Adds the modules of the imports """
    new = set()
    for d in definitions:
        imp_or_stmt = d.get_definition()
        if isinstance(imp_or_stmt, tree.Import):
            s = imports.ImportWrapper(evaluator, d)
            new |= set(s.follow(is_goto=True))
    return set(definitions) | new
