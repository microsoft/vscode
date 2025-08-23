import re
from textwrap import dedent
from typing import List

# All possible sections in Google style docstrings
SECTION_HEADERS: List[str] = [
    "Args",
    "Returns",
    "Raises",
    "Yields",
    "Example",
    "Examples",
    "Attributes",
    "Note",
    "Todo",
]

# These sections will not be parsed as a list of arguments/return values/etc
PLAIN_TEXT_SECTIONS: List[str] = [
    "Examples",
    "Example",
    "Note",
    "Todo",
]

ESCAPE_RULES = {
    # Avoid Markdown in magic methods or filenames like __init__.py
    r"__(?P<text>\S+)__": r"\_\_\g<text>\_\_",
}


class Section:
    def __init__(self, name: str, content: str) -> None:
        self.name = name
        self.content = ""

        self._parse(content)

    def _parse(self, content: str) -> None:
        content = content.rstrip("\n")

        if self.name in PLAIN_TEXT_SECTIONS:
            self.content = dedent(content)
            return

        parts = []
        cur_part = []

        for line in content.split("\n"):
            line = line.replace("    ", "", 1)

            if line.startswith(" "):
                # Continuation from a multiline description
                cur_part.append(line)
                continue

            if cur_part:
                # Leaving multiline description
                parts.append(cur_part)
                cur_part = [line]
            else:
                # Entering new description part
                cur_part.append(line)

        # Last part
        parts.append(cur_part)

        # Format section
        for part in parts:
            indentation = ""
            skip_first = False

            if ":" in part[0]:
                spl = part[0].split(":")

                arg = spl[0]
                description = ":".join(spl[1:]).lstrip()
                indentation = (len(arg) + 6) * " "

                if description:
                    self.content += "- `{}`: {}\n".format(arg, description)
                else:
                    skip_first = True
                    self.content += "- `{}`: ".format(arg)
            else:
                self.content += "- {}\n".format(part[0])

            for n, line in enumerate(part[1:]):
                if skip_first and n == 0:
                    # This ensures that indented args get moved to the
                    # previous line
                    self.content += "{}\n".format(line.lstrip())
                    continue

                self.content += "{}{}\n".format(indentation, line.lstrip())

        self.content = self.content.rstrip("\n")

    def as_markdown(self) -> str:
        return "#### {}\n\n{}\n\n".format(self.name, self.content)


class GoogleDocstring:
    def __init__(self, docstring: str) -> None:
        self.sections: List[Section] = []
        self.description: str = ""

        self._parse(docstring)

    def _parse(self, docstring: str) -> None:
        self.sections = []
        self.description = ""

        buf = ""
        cur_section = ""

        for line in docstring.split("\n"):
            if is_section(line):
                # Entering new section
                if cur_section:
                    # Leaving previous section, save it and reset buffer
                    self.sections.append(Section(cur_section, buf))
                    buf = ""

                # Remember currently parsed section
                cur_section = line.rstrip(":")
                continue

            # Parse section content
            if cur_section:
                buf += line + "\n"
            else:
                # Before setting cur_section, we're parsing the function description
                self.description += line + "\n"

        # Last section
        self.sections.append(Section(cur_section, buf))

    def as_markdown(self) -> str:
        text = self.description

        for section in self.sections:
            text += section.as_markdown()

        return text.rstrip("\n") + "\n"  # Only keep one last newline


def is_section(line: str) -> bool:
    for section in SECTION_HEADERS:
        if re.search(r"{}:".format(section), line):
            return True

    return False


def looks_like_google(value: str) -> bool:
    for section in SECTION_HEADERS:
        if re.search(r"{}:\n".format(section), value):
            return True

    return False


def google_to_markdown(text: str, extract_signature: bool = True) -> str:
    # Escape parts we don't want to render
    for pattern, replacement in ESCAPE_RULES.items():
        text = re.sub(pattern, replacement, text)

    docstring = GoogleDocstring(text)

    return docstring.as_markdown()
