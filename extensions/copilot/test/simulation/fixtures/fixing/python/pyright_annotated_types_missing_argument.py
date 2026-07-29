from typing import Annotated

# This should generate an error because all Annotated types should
# include at least two type arguments.
d: Annotated[int]