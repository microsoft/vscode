#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

"""
Python function call parser for auto-accept functionality.
Extracts function calls from Python code using AST parsing.
"""

import ast
from typing import Dict, List


def get_full_func_name(func_node):
    """Extract the full function name from various AST node types"""
    if isinstance(func_node, ast.Name):
        # Simple function call: func()
        return func_node.id
    elif isinstance(func_node, ast.Attribute):
        # Method call: obj.method() or module.func()
        obj_name = get_full_func_name(func_node.value)
        return f'{obj_name}.{func_node.attr}'
    elif isinstance(func_node, ast.Subscript):
        # Subscript call: obj[key]() or dict['func']()
        obj_name = get_full_func_name(func_node.value)
        return f'{obj_name}[subscript]'
    elif isinstance(func_node, ast.Constant):
        # Literal method call: "hello".upper() or (5).bit_length()
        return f'<literal:{type(func_node.value).__name__}>'
    elif isinstance(func_node, ast.Call):
        # Chained call: func().method() or func()()
        return '<call_result>'
    elif isinstance(func_node, ast.Lambda):
        # Lambda function call: (lambda x: x)()
        return '<lambda>'
    else:
        # Other complex cases
        return f'<{type(func_node).__name__}>'


class FunctionCallExtractor(ast.NodeVisitor):
    """AST visitor to extract function calls"""
    
    def __init__(self):
        self.function_calls = []
    
    def visit_Call(self, node):
        """Visit Call nodes (function calls)"""
        func_name = get_full_func_name(node.func)
        self.function_calls.append(func_name)
        
        # Continue visiting child nodes to find nested calls
        self.generic_visit(node)
    
    def get_calls(self):
        """Return the collected function calls"""
        return self.function_calls


def extract_python_function_calls(code: str) -> dict:
    """
    Extract all function calls from Python code using AST parsing.
    
    Args:
        code: Python source code as a string
        
    Returns:
        Dictionary with success status and function calls list
    """
    try:
        # Parse the code into an AST
        tree = ast.parse(code)
        
        # Extract function calls
        extractor = FunctionCallExtractor()
        extractor.visit(tree)
        function_calls = extractor.get_calls()
        
        return {
            "success": True,
            "function_calls": function_calls
        }
        
    except SyntaxError as e:
        return {
            "success": False,
            "error": f"Python syntax error: {str(e)}",
            "function_calls": []
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"AST parsing failed: {str(e)}",
            "function_calls": []
        }


def parse_functions_rpc(code: str, language: str) -> Dict:
    """
    RPC entry point for function parsing.
    This is the function that will be called by the help comm.
    
    Args:
        code: Source code to parse
        language: Programming language ('python' expected)
        
    Returns:
        Dict with functions, success, and optional error
    """
    
    # Only handle Python in this Python runtime
    if language != "python":
        return {
            "functions": [],
            "success": False,
            "error": f"Python runtime cannot parse {language} code"
        }
    
    try:
        # Use the AST parser
        result = extract_python_function_calls(code)
        
        # Convert from the internal format to the expected format
        return {
            "functions": result.get("function_calls", []),
            "success": result.get("success", False),
            "error": result.get("error")
        }
        
    except Exception as e:
        return {
            "functions": [],
            "success": False,
            "error": str(e)
        }