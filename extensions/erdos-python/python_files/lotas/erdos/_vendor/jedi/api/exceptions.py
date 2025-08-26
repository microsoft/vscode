class _JediError(Exception):
    pass


class InternalError(_JediError):
    """
    This error might happen a subprocess is crashing. The reason for this is
    usually broken C code in third party libraries. This is not a very common
    thing and it is safe to use Jedi again. However using the same calls might
    result in the same error again.
    """


class WrongVersion(_JediError):
    """
    This error is reserved for the future, shouldn't really be happening at the
    moment.
    """


class RefactoringError(_JediError):
    """
    Refactorings can fail for various reasons. So if you work with refactorings
    like :meth:`.Script.rename`, :meth:`.Script.inline`,
    :meth:`.Script.extract_variable` and :meth:`.Script.extract_function`, make
    sure to catch these. The descriptions in the errors are usually valuable
    for end users.

    A typical ``RefactoringError`` would tell the user that inlining is not
    possible if no name is under the cursor.
    """
