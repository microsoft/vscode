"""
This is an example Python source file to use as test data.  It's pulled from the synth repo
with minor edits to make it a better test case.
"""

from tree_sitter import Language, Parser
import re
import os, sys
from dataclasses import dataclass, field
import codesynthesis.synthesis as synthesis
import harness.fun_run as fun_run
from harness.utils import temporary_path_change_to, get_canonical_logger, TreeSitter
import types
import subprocess

logger = get_canonical_logger("FilesWithImport")

@dataclass
class Import:
    module: str
    filename: str = None
    source_text: str = None
    as_name: str = None
    original_statement: str = None
    # list of imported objects
    imported: list = field(default_factory=list)

    def add_source(self):
        assert self.filename, f"No filename for {self.module}"
        with open(self.filename, "r") as f:
            self.source_text = f.read()      # intentional trailing whitespace


class ImportAnalysis:
    """
    Methods to discribe the effect of an import statement.
    """
    def __init__(self, imp: Import, clean_environment=None, import_directly=True):
        self.imp = imp
        # a clean dict into which to import the module
        if clean_environment is None:
            clean_environment = {
                "__builtins__": __builtins__,
                "__name__": __name__,
                "__doc__": __doc__,
                "__package__": "thefuck",
                "__file__": __file__
            }
        self._clean_environment = clean_environment
        if import_directly:
            self.impact = self._import(imp.original_statement, imp.filename)
            self.imported_objects = self._get_imported_objects()
        else:
            self.impact = None
            self.imported_objects = None
        self.imported_directly = import_directly # if False, then can only use describe_from_outside

    def _import(self, statement, filename):
        """
        tries to import module from filename path, if that doesn't work parent folder, etc.,
        returns a dictionary of the new objects created by the import statement.
        """
        path = os.path.dirname(filename)
        d = self._clean_environment.copy()
        while len(path) > 1:
            try:
                # chdir to path, then exec statement
                #with temporary_path_change_to(path):
                d_before = d.copy()
                exec(statement, d)
                # remove from d what was already in d_before
                d = {k: v for k, v in d.items() if k not in d_before}
                return d
            except ModuleNotFoundError:
                path = os.path.dirname(path)
        raise FileNotFoundError(f"Unable to import module from {filename}")

    def _get_imported_objects(self, include_private=False):
        """
        Returns a dict of relevant imported objects (by their names)
        For `from a import b`, this should be {"b": b}
        For `import a as b`, this should be {"b.x": b.x} for all imported objects x
        For `from a import *`, this should be {"x": x} for all imported objects x
        TODO For `import a.b`, this should be {"a.b.x": a.b.x} -- could maybe just increase depth correctly?
        """
        out = {}
        depth = 0
        while all(isinstance(is_it_a_module, types.ModuleType) for is_it_a_module in out.values()):
            out = self._unpack_dict(self.impact, include_private=include_private, depth=depth)
            depth += 1
        return out

    @classmethod
    def _unpack_dict(cls, dictionary, include_private, depth, prefix=""):
        # names imported directly, except modules that will be expanded on later, and perhaps private names
        out = {prefix + name: obj for name, obj in dictionary.items() if \
            (depth == 0 or not isinstance(obj, types.ModuleType)) and \
            (include_private or not name.startswith("_"))}

        if depth > 0:
            # for modules, add their objects
            for name, module in dictionary.items():
                if isinstance(module, types.ModuleType):
                    one_level_deeper = cls._unpack_dict(module.__dict__, include_private, depth=depth-1, prefix=name+".")
                    out.update(one_level_deeper)

        return out

    def get_names_of_imported_by_type(self):
        """return the imported objects as a dict, with their type name as key"""
        d = dict()
        for object_name, obj in self.imported_objects.items():
            typ = type(obj).__name__
            if typ in d:
                d[typ].append(object_name)
            else:
                d[typ] = [object_name]
        return d

    def get_methods_of_type(self, class_name, include_private=False):
        """return the names of methods of the given type"""
        cls = self.imported_objects[class_name]
        names = [name for name in dir(cls) if include_private or not name.startswith("_")]
        # return only the names which describe methods
        return [name for name in names if callable(getattr(cls, name))]

    def get_function_description(self, func_name):
        """return a string describing the function and its arguments"""
        fun = self.imported_objects[func_name]
        args = "(" + ", ".join(fun.__code__.co_varnames[:fun.__code__.co_argcount]) + ")"
        return f"{func_name}{args}"

    def get_class_description(self, class_name):
        """return a string describing the class and its methods"""
        return f"{class_name} with functions {', '.join(self.get_methods_of_type(class_name))}"

    def describe(self) -> str:
        """
        return a description of the import, detailing classes, functions and properties as follows:
        [as name] adds the following classes:
        - [class name] with functions [function name], ..., [another function name]
        ...
        [as name] adds the functions [function name], ..., [another function name]
        [as name] also adds the objects: [property name: property type], ..., [another property name: property type]
        """
        imported_names = self.get_names_of_imported_by_type()
        if "type" in imported_names.keys():
            classes = imported_names["type"]
            answer = f"{self.imp.as_name} adds the following classes:\n" + \
            "\n".join([f" - {self.get_class_description(class_name)}"
                       for class_name in classes]) + \
            "\n"
        else:
            answer = ""

        if "function" in imported_names.keys():
            functions = imported_names["function"]
            answer += f"{self.imp.as_name} adds the functions {', '.join(self.get_function_description(func_name) for func_name in functions)}\n"

        # all other types are designated as properties
        properties = [key for key in imported_names.keys() if key not in ["function", "type"]]
        if properties:
            answer += f"{self.imp.as_name} {'also ' if answer else ''}adds the objects: {', '.join([f'{imported_names[name]}: {name}' for name in properties])}\n"

        return answer

    def description_comment(self) -> str:
        """wrap the multiline string describe() into a comment, each of whose lines begins with '#'"""
        return "\n".join(["# " + line for line in self.describe().split("\n")])

    def describe_from_the_outside(self, path):
        """writes the import statement plus ask to describe to a file in path, runs that file, gathers output"""
        filename = os.path.abspath(path + "/" + "tmp.py")
        assert os.path.exists(filename) == False, f"{filename} already exists!"
        try:
            with open(filename, "w") as f:
                f.write(f"""from codesynthesis.files_with_import import ImportAnalysis, ImportParser
imp_statement = "{self.imp.original_statement}"
imp = ImportParser().get_all_imports(imp_statement, "{filename}")[0]
env = dict(
            __builtins__= __builtins__,
            __name__= __name__,
            __doc__= __doc__,
            __package__= __package__,
            __file__= __file__
        )
analysis = ImportAnalysis(imp, env)
print(analysis.describe())"""
                )
            # get module name from cwd and filename:
            relative_filename = os.path.relpath(filename, os.getcwd())
            module_name = relative_filename.replace(".py", "").replace("/", ".")
            try:
                out = subprocess.check_output(["python", "-m", module_name], stderr=subprocess.STDOUT).decode("utf-8").strip()
            except subprocess.CalledProcessError as e:
                error = e.output.decode("utf-8")
                if "FileNotFoundError: Unable to import module from" in error:
                    logger.error(f"Could not import module through {self.imp.original_statement} in {filename}. The import of {self.imp.module} will not be documented.")
                    return ""
                else:
                    raise e
        finally:
            os.remove(filename)
        return out

    def describe_from_the_outside_as_comment(self, path):
                return "\n".join(["# " + line for line in self.describe_from_the_outside(path).split("\n")])

class ImportParser:
    PY_LANGUAGE = TreeSitter().language("python")
    IMP_QUERY = ["(import_statement) @import",
                 "(future_import_statement) @import",
                 "(import_from_statement) @import"]
    MODULE_LEVEL_IMP_QUERY = ["(module (import_statement) @import)",
                 "(module (future_import_statement) @import)",
                 "(module (import_from_statement) @import)"]
    # TODO: Define MODULE_SCOPE_IMP_QUERY, where the import can't be inside a functon, but can be inside an if or try.
    def __init__(self):
        self.parser = TreeSitter().get_parser("python")
        Parser()
        self.parser.set_language(self.PY_LANGUAGE)

    @staticmethod
    def get_text_from(text, capture):
        """
        Trim the text to the content corresponding to a single tree-sitter capture expression.
        @param text: The whole text of the language document.
        @param capture: The particular capture expression within the document to trim to.
        @return: The text for the capture expression only.
        """
        lines = text.split('\n')
        relevant_lines = lines[capture.start_point[0] : capture.end_point[0]+1]
        # in case the extract is just one line, the trim on the right needs to come before the trim on the left!
        relevant_lines[-1] = relevant_lines[-1][:capture.end_point[1]]
        relevant_lines[0] = relevant_lines[0][capture.start_point[1]:]
        return '\n'.join(relevant_lines)

    @staticmethod
    def replace_text_from(text, capture, replacement):
        """
        replaces the text from the capture with the replacement.
        """
        lines = text.split('\n')
        prelude = lines[0 : capture.start_point[0]+1]
        if prelude:
            prelude[-1] = prelude[-1][:capture.start_point[1]+1]
        postlude = lines[capture.end_point[0] + 1 :]
        if postlude:
            postlude[0] = postlude[0][capture.end_point[1]:]
        return '\n'.join(prelude + [replacement] + postlude)


    def get_list_of_import_captures(self, text):
        tree = self.parser.parse(bytes(text, "utf8"))
        list_of_capture_lists = [self.PY_LANGUAGE.query(query).captures(tree.root_node) for query in self.IMP_QUERY]
        # flatten array
        return [item[0] for sublist in list_of_capture_lists for item in sublist]

    def get_import_statements(self, text):
        """
        returns a list of all imports (as far as found in the statement, not the background like content)
        """
        captures = self.get_list_of_import_captures(text)
        imports = [self.parse_single_import(self.get_text_from(text, capture)) for capture in captures]
        return imports

    def parse_single_import(self, relevant_text):
        """
        parses a single import statement (without background like content)
        TODO: deal with the case of several imports in one expression, e.g. import a, b, c
        """
        # module is the XXX in from XXX import ..., or in import XXX
        if re.search('from ([^ ]+) import', relevant_text):
            module = re.search('from (\\.)*([^ ]+) import', relevant_text).group(2)
        else:
            module = re.search('import (\\.)*([^ ]+)', relevant_text).group(2)
        # as_name is the XXX in import ... as XXX or from ... import ... as XXX
        if re.search(' as ([^ ]+)', relevant_text):
            as_name = re.search(' as ([^ ]+)', relevant_text).group(1)
        else:
            as_name = module
        # imported are the XXX, YYY, ZZZ in from XXX import XXX, YYY, ZZZ
        # but we don't need them right now, so TODO
        imported = ["TODO"]
        return Import(module=module, as_name=as_name, imported=imported, original_statement=relevant_text)

    def get_all_imports(self, source_text, source_filename):
        """
        adds all import files found in the source_text, if it were at disk as filename
        skips standard packages (i.e. anything not found on disk at location filename)
        """
        raw_imports = self.get_import_statements(source_text)
        relevant_imports = []
        for imp in raw_imports:
            # check whether filename exists; if not: check whether it exist in the parent folder, recursively
            base_folder = os.path.dirname(source_filename)
            # Note: The following does not take '..module' imports into account differently
            # (which will mostly be ok though, unless there's a name clash)
            while filename:= base_folder + '/' + '/'.join(imp.module.split('.')):
                if os.path.isfile(filename + '.py'):
                    imp.filename = filename + '.py'
                    imp.add_source()
                    relevant_imports.append(imp)
                    break
                else:
                    base_folder = os.path.dirname(base_folder)
                    if len(base_folder) <= 1:
                        break
        return relevant_imports

    def remove_imports(self, text, imps):
        """
        returns the text minus the imports

        Note: This is theoretically a bit too aggressive, as it also removes the text of the import statements inside quotes etc
        Note: This is theoreticallly a bit too aggressive, as it also removes captures where the import model name is only a substring
        """
        captures = self.get_list_of_import_captures(text)
        for capture in captures:
            # only act if imp.module is in the capture expression
            capture_text = self.get_text_from(text, capture)
            if any(imp.module in capture_text for imp in imps):
                text = text.replace(capture_text, '')
        return text

    def truncate_left_but_keep_module_level_imports(self, text, length_in_tokens: int, fixed_prefix: str = ""):
        """make sure to keep the module level imports, but otherwise drop lines as needed, calling truncate_left"""
        # identify imports
        captures = self.get_list_of_import_captures(text)
        lines = text.split('\n')
        idc_to_keep = set()
        for capture in captures:
            for lineno in range(capture.start_point[0], capture.end_point[0] + 1):
                idc_to_keep.add(lineno)

        result = synthesis.truncate_left_keeping_lines_with_preference(lines, idc_to_keep, length_in_tokens, fixed_prefix)
        return result


def test_import_parser():
    ip = ImportParser()
    assert len(ip.get_all_imports("from codesynthesis.synthesis import abc\nprint(32)", "/Users/wunderalbert/openai/synth/test.py")) > 0
    assert len(ip.get_all_imports("import codesynthesis.synthesis as abc\nprint(32)", "/Users/wunderalbert/openai/synth/test.py")) > 0

class FunctionWithImportsKept(fun_run.PythonFunctionInTheWild):
    def make_prompt_for_fct(self, max_length_in_tokens = synthesis.CONTEXT_WINDOW_SIZE):
        return ImportParser().truncate_left_but_keep_module_level_imports('# Python 3\n' + self.prelude + '\n' + self.header, max_length_in_tokens)


class FunctionWithImports(fun_run.PythonFunctionInTheWild):
    def __init__(self, function_location, discriminative_model):
        super().__init__(function_location, discriminative_model)
        # get the absolute path
        self.filename = os.path.abspath(self.function_location.path)
        source_text = ''.join(self.source_lines)
        self.imports = ImportParser().get_all_imports(source_text, self.filename)
        importless_source_lines_without_newline_char = ImportParser().remove_imports(source_text, self.imports).split("\n")
        self.importless_source_lines = [line + "\n" for line in importless_source_lines_without_newline_char]

    def make_prompt_for_fct_without_imports(self):
        """call super.make_prompt_for_function, but with importless_source_lines temporarily replacing source_lines"""
        complete_source_lines = self.source_lines
        try:
            self.source_lines = self.importless_source_lines
            prompt = super().make_prompt_for_fct(fun_run.VERY_LARGE_NUMBER)
        finally:
            self.source_lines = complete_source_lines
        return prompt


class FunctionWithImportsPastedVerbatim(FunctionWithImports):
    """
    Pastes code verbatim
    """
    def make_prompt_for_fct(self, max_length_in_tokens):
        super_prompt = super().make_prompt_for_fct_without_imports()
        desired_prompt = "\n\n".join([imp.source_text for imp in self.imports]) + "\n\n" + super_prompt
        truncated_prompt = synthesis.truncate_left(desired_prompt, max_length_in_tokens)
        return truncated_prompt

class FunctionWithImportsPastedWithComments(FunctionWithImports):
    """
    Pastes code verbatim as a comment that this is the content of that module
    """
    def make_prompt_for_fct(self, max_length_in_tokens):
        prompt = ""
        for imp in self.imports:
            prompt = prompt + \
                     f"# Content of module {imp.as_name}\n# " + \
                     f"\n# ".join(imp.source_text.split('\n')) + \
                     f"\n\n"
        prompt = prompt + super().make_prompt_for_fct()
        truncated_prompt = synthesis.truncate_left(prompt, max_length_in_tokens)
        return truncated_prompt

class FunctionWithImportsNamespacedInClasses(FunctionWithImports):
    """
    Encapsulates imports within classes -- this does not create sound code, as the self argument is missing from functions, and variables are not prefixed with `class.`
    """
    def make_prompt_for_fct(self, max_length_in_tokens):
        prompt = ""
        for imp in self.imports:
            prompt = prompt + \
                     f"class {imp.as_name}:\n{self.STRING_FOR_INDENTATION_LEVEL_INCREASE}" + \
                     f"\n{self.STRING_FOR_INDENTATION_LEVEL_INCREASE}".join(imp.source_text.split('\n')) + \
                     f"\n\n"
        prompt = prompt + super().make_prompt_for_fct_without_imports()
        truncated_prompt = synthesis.truncate_left(prompt, max_length_in_tokens)
        return truncated_prompt


class FunctionWithImportsReplacedOneByOne(fun_run.PythonFunctionInTheWild):
    """
    Schemes where all imports that import local files are replaced or added to,
    e.g. by summarizing their content, or quoting it, etc.
    """
    def __init__(self, function_location, discriminative_model):
        super().__init__(function_location, discriminative_model)
        # get the absolute path
        self.filename = os.path.abspath(self.function_location.path)
        source_text = ''.join(self.source_lines)
        self.imports = ImportParser().get_all_imports(source_text, self.filename)
        logger.debug(f"In the function {self.function_location.name}, there are {len(self.imports)} repo imports: {[imp.module for imp in self.imports]}")

    keep_imports_and_description_by_preference = True

    def replace_import(self, imp: Import):
        """
        Given one import, returns the replacement text pasted into where that import was.
        E.g. for a text `foo\nimport bar\nbaz`, if the import is replaced by the string "bat",
        the result will be "foo\nbat\nbaz"
        """
        raise NotImplementedError("Needs to be implemented in subclass.")

    def make_prompt_for_fct(self, max_length_in_tokens):
        """call replace import for each import"""
        prompt = super().make_prompt_for_fct(max_length_in_tokens)
        # imports should be sorted by start position anyways, but let's be safe
        sorted_imports = self.imports.copy()
        # replace them from bottom to top, so that the replacements don't change the position of other imports
        sorted_imports.reverse()
        import_replacements = set()
        for imp in sorted_imports:
            new_statement = self.replace_import(imp)
            import_replacements.add(new_statement)
            prompt = prompt.replace(imp.original_statement, new_statement)
        # if descriptions have higher priority, extract the lines where they are and pass those lines to synthesis.truncate_left_keeping_lines_with_preference
        if self.keep_imports_and_description_by_preference:
            new_lines = set()
            for statement in import_replacements:
                match = prompt.find(statement)
                lines_of_match = range(
                    prompt[:match].count("\n"),
                    prompt[:match+len(statement)].count("\n")+1)
                new_lines.update(lines_of_match)
            truncated_prompt = synthesis.truncate_left_keeping_lines_with_preference(prompt.split("\n"), new_lines, max_length_in_tokens)
        else:
            truncated_prompt = synthesis.truncate_left(prompt, max_length_in_tokens)
        return truncated_prompt


class FunctionWithImportsCommentedWithTheFunctionsTheyImport(FunctionWithImportsReplacedOneByOne):
    """
    adds a comment to each import with the objects it imports
    """
    def replace_import(self, imp: Import):
        # find all toplevel functions in imp.source_text, i.e. the `foo` from lines of the form `def foo()`
        source_starting_with_newline = ("\n" + imp.source_text)
        toplevel_functions = re.findall(r"\ndef\s*([a-zA-Z0-9_]+)\s*\(", source_starting_with_newline)
        toplevel_classes = re.findall(r"\nclass\s*([a-zA-Z0-9_]+)", source_starting_with_newline)
        toplevel_classes_with_their_functions = {}
        for classname in toplevel_classes:
            cls_source_lines_with_trailing = source_starting_with_newline.split("\nclass " + classname)[1].split("\n")[1:]
            if not cls_source_lines_with_trailing:
                continue
            indices_after_class_end = [i for i, line in enumerate(cls_source_lines_with_trailing) if not line.startswith(" " * 4) and not line.startswith("#")]
            if indices_after_class_end:
                cls_source_lines = cls_source_lines_with_trailing[:indices_after_class_end[0]]
            else:
                cls_source_lines = cls_source_lines_with_trailing
            cls_body = "\n".join(cls_source_lines)
            # remove everything after the first line with less than 4 spaces indentation
            functions_not_starting_with_underscore = re.findall(r"\ndef\s*([a-zA-Z0-9_]+)\s*\(", cls_body)
            toplevel_classes_with_their_functions[classname] = functions_not_starting_with_underscore
        description = imp.original_statement
        if toplevel_functions:
            description = description + f"\n# module {imp.as_name} declares the following functions: {', '.join(toplevel_functions)}"
        for classname, functions in toplevel_classes_with_their_functions.items():
            description = description + f"\n# module {imp.as_name} declares the class {classname}"

            if functions:
                description = description + f", which contains the following functions: {', '.join(functions)}"
        return description

class FunctionWithImportsCommentedWithImportAnalysis(FunctionWithImportsReplacedOneByOne):
    def replace_import(self, imp: Import):
        analysis = ImportAnalysis(imp, import_directly=False)
        description = imp.original_statement + "\n" + \
            analysis.describe_from_the_outside_as_comment(os.path.dirname(self.filename))
        logger.debug(f"To the import {imp.module} as {imp.as_name}, we add the following comment: {description}")
        return description