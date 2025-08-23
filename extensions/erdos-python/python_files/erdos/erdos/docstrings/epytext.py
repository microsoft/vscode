#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

import re
from textwrap import dedent
from typing import List

ESCAPE_RULES = {
    r"__(?P<text>\S+)__": r"\_\_\g<text>\_\_",
}

EPYTEXT_FIELDS: List[str] = [
    "@param",
    "@type",
    "@keyword",
    "@ivar",
    "@cvar",
    "@var",
    "@group",
    "@sort",
    "@todo",
    "@return",
    "@rtype",
    "@raise",
    "@see",
    "@note",
    "@attention",
    "@bug",
    "@warning",
    "@version",
    "@deprecated",
    "@since",
    "@change",
    "@permission",
    "@requires",
    "@precondition",
    "@postcondition",
    "@invariant",
    "@author",
    "@organization",
    "@copyright",
    "@license",
    "@contact",
    "@summary",
]


class Section:
    def __init__(self, name: str, content: str) -> None:
        name = dedent(name)

        split = name[1:].split(" ", 1)

        self.name = split[0].capitalize() if split[0].endswith(":") else split[0].capitalize() + ":"
        self.content = ""

        self.arg_name = ""

        self._parse(split[1] + content)

    def _parse(self, content: str) -> None:
        content = content.rstrip("\n")

        parts = []
        cur_part = []

        for line in content.split("\n"):
            line = line.replace("    ", " ", 1)
            line = line.replace("\t", " ", 1)

            if line.startswith(" "):
                cur_part.append(line)
                continue

            if cur_part:
                parts.append(cur_part)
                cur_part = [line]
            else:
                cur_part.append(line)

        parts.append(cur_part)
        for part in parts:
            indentation = ""
            skip_first = False

            if ":" in part[0]:
                spl = part[0].split(":")

                arg = spl[0]
                self.arg_name = arg

                description = ":".join(spl[1:]).lstrip()

                if description:
                    self.content += f"- `{arg}`: {description}".rstrip()
                    skip_first = True
                else:
                    self.content += f" {arg}\n"
            else:
                self.content += f"{part[0]}\n"

            for n, line in enumerate(part[1:]):
                if skip_first and n == 0:
                    self.content += f" {line.lstrip()}\n"
                    continue

                self.content += f"{indentation}{line.lstrip()}\n"

        self.content = self.content.rstrip("\n").rstrip()

    def as_markdown(self) -> str:
        return f"#### {self.name}\n\n{self.content}\n\n"


class EpytextDocstring:
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
                if cur_section:
                    self.sections.append(Section(cur_section, buf))
                    buf = ""

                cur_section = line.rstrip()
                continue

            if cur_section:
                buf += line + "\n"
            else:
                self.description += line + "\n"

        self.sections.append(Section(cur_section, buf))

    def combine_sections(self):
        self.sections.sort(key=custom_sort_key)

        unique_sections = {}
        type_sections = {}
        for section in self.sections:
            name = section.name
            content = section.content

            if name == "Type:":
                type_sections[section.arg_name] = content.split(f"`{section.arg_name}`: ", 1)[1]
            elif name == "Rtype:":
                unique_sections[
                    "Return:"
                ].content = f"({content.rstrip()}) {unique_sections['Return:'].content}"
            else:
                matching_type = type_sections.get(str(section.arg_name))

                if matching_type:
                    content_split = content.split(":", 1)
                    section.content = (
                        f"- `{section.arg_name}` ({matching_type.rstrip()}):{content_split[1]}"
                    )
                if name in unique_sections:
                    unique_sections[name].content += "\n" + section.content
                else:
                    unique_sections[name] = section

        return list(unique_sections.values())

    def as_markdown(self) -> str:
        text = self.description

        unique_sections = self.combine_sections()

        for section in unique_sections:
            text += section.as_markdown()

        return text.rstrip("\n") + "\n"


def custom_sort_key(section):
    if section.name == "Type:":
        return 0
    if section.name == "Rtype":
        return 2
    else:
        return 1


def looks_like_epytext(value: str) -> bool:
    return any(re.search(f"{field}", value) for field in EPYTEXT_FIELDS)


def is_section(line: str) -> bool:
    return any(re.search(f"{field}", line) for field in EPYTEXT_FIELDS)


def epytext_to_markdown(text: str) -> str:
    for pattern, replacement in ESCAPE_RULES.items():
        text = re.sub(pattern, replacement, text)

    docstring = EpytextDocstring(text)

    return docstring.as_markdown()




















