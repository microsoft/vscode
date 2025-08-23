"""
    pygments.lexers.mips
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for MIPS assembly.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, words
from erdos.erdos._vendor.pygments.token import Whitespace, Comment, String, Keyword, Name, Text

__all__ = ["MIPSLexer"]


class MIPSLexer(RegexLexer):
    """
    A MIPS Assembly Lexer.

    Based on the Emacs major mode by hlissner:
    https://github.com/hlissner/emacs-mips-mode
    """

    name = 'MIPS'
    aliases = ['mips']
    version_added = ''
    # TODO: add '*.s' and '*.asm', which will require designing an analyse_text
    # method for this lexer and refactoring those from Gas and Nasm in order to
    # have relatively reliable detection
    filenames = ['*.mips', '*.MIPS']
    url = 'https://mips.com'

    keywords = [
        # Arithmetic insturctions
        "add", "sub", "subu", "addi", "subi", "addu", "addiu",
        # Multiplication/division
        "mul", "mult", "multu", "mulu", "madd", "maddu", "msub", "msubu", "div", "divu",
        # Bitwise operations
        "and", "or", "nor", "xor", "andi", "ori", "xori", "clo", "clz",
        # Shifts
        "sll", "srl", "sllv", "srlv", "sra", "srav",
        # Comparisons
        "slt", "sltu", "slti", "sltiu",
        # Move data
        "mfhi", "mthi", "mflo", "mtlo", "movn", "movz", "movf", "movt",
        # Jump
        "j", "jal", "jalr", "jr",
        # branch
        "bc1f", "bc1t", "beq", "bgez", "bgezal", "bgtz", "blez", "bltzal", "bltz", "bne",
        # Load
        "lui", "lb", "lbu", "lh", "lhu", "lw", "lwcl", "lwl", "lwr",
        # Store
        "sb", "sh", "sw", "swl", "swr", # coproc: swc1 sdc1
        # Concurrent load/store
        "ll", "sc",
        # Trap handling
        "teq", "teqi", "tne", "tneqi", "tge", "tgeu", "tgei", "tgeiu", "tlt", "tltu", "tlti",
        "tltiu",
        # Exception / Interrupt
        "eret", "break", "bop", "syscall",
        # --- Floats -----------------------------------------------------
        # Arithmetic
        "add.s", "add.d", "sub.s", "sub.d", "mul.s", "mul.d", "div.s", "div.d", "neg.d",
        "neg.s",
        # Comparison
        "c.e.d", "c.e.s", "c.le.d", "c.le.s", "c.lt.s", "c.lt.d", # "c.gt.s", "c.gt.d",
        "madd.s", "madd.d", "msub.s", "msub.d",
        # Move Floats
        "mov.d", "move.s", "movf.d", "movf.s", "movt.d", "movt.s", "movn.d", "movn.s",
        "movnzd", "movz.s", "movz.d",
        # Conversion
        "cvt.d.s", "cvt.d.w", "cvt.s.d", "cvt.s.w", "cvt.w.d", "cvt.w.s", "trunc.w.d",
        "trunc.w.s",
        # Math
        "abs.s", "abs.d", "sqrt.s", "sqrt.d", "ceil.w.d", "ceil.w.s", "floor.w.d",
        "floor.w.s", "round.w.d", "round.w.s",
    ]

    pseudoinstructions = [
        # Arithmetic & logical
        "rem", "remu", "mulo", "mulou", "abs", "neg", "negu", "not", "rol", "ror",
        # branches
        "b", "beqz", "bge", "bgeu", "bgt", "bgtu", "ble", "bleu", "blt", "bltu", "bnez",
        # loads
        "la", "li", "ld", "ulh", "ulhu", "ulw",
        # Store
        "sd", "ush", "usw",
        # move
        "move", # coproc: "mfc1.d",
        # comparisons
        "sgt", "sgtu", "sge", "sgeu", "sle", "sleu", "sne", "seq",
        # --- Floats -----------------------------------------------------
        # load-store
        "l.d", "l.s", "s.d", "s.s",
    ]

    directives = [
        ".align", ".ascii", ".asciiz", ".byte", ".data", ".double", ".extern", ".float",
        ".globl", ".half", ".kdata", ".ktext", ".space", ".text", ".word",
    ]

    deprecated = [
        "beql", "bnel", "bgtzl", "bgezl", "bltzl", "blezl", "bltzall", "bgezall",
    ]

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'#.*', Comment),
            (r'"', String, 'string'),
            (r'-?[0-9]+?', Keyword.Constant),
            (r'\w*:', Name.Function),
            (words(deprecated, suffix=r'\b'), Keyword.Pseudo), # need warning face
            (words(pseudoinstructions, suffix=r'\b'), Name.Variable),
            (words(keywords, suffix=r'\b'), Keyword),
            (r'[slm][ftwd]c[0-9]([.]d)?', Keyword),
            (r'\$(f?[0-2][0-9]|f?3[01]|[ft]?[0-9]|[vk][01]|a[0-3]|s[0-7]|[gsf]p|ra|at|zero)',
             Keyword.Type),
            (words(directives, suffix=r'\b'), Name.Entity), # Preprocessor?
            (r':|,|;|\{|\}|=>|@|\$|=', Name.Builtin),
            (r'\w+', Text),
            (r'.', Text),
        ],
        'string': [
            (r'\\.', String.Escape),
            (r'"', String, '#pop'),
            (r'[^\\"]+', String),
        ],
    }
