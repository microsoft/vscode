# Copyright (c) Lotas Inc. All rights reserved.
# Licensed under the MIT License.

import argparse
import json
import sys


def convert_notebook_content_to_text(notebook_content: str, format_name: str = "py:percent") -> dict:
    """Convert notebook content string to text format."""
    try:
        import jupytext
        import nbformat
        
        # Parse the notebook content
        notebook = nbformat.reads(notebook_content, as_version=nbformat.NO_CONVERT)
        
        # Convert to text using jupytext
        converted_text = jupytext.writes(notebook, format_name)
        
        return {
            "success": True,
            "message": "Notebook content converted to text successfully",
            "text": converted_text,
            "cell_count": len(notebook.get('cells', []))
        }
            
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to convert notebook content to text: {str(e)}"
        }


def convert_text_to_notebook_content(text_content: str, format_name: str = "py:percent") -> dict:
    """Convert text content to notebook format."""
    try:
        import jupytext
        import nbformat
        
        # Normalize format name - jupytext.reads expects string format like "py:percent"
        if format_name == "percent":
            fmt = "py:percent"
        else:
            fmt = format_name
        
        # Convert text to notebook using jupytext with string format
        notebook = jupytext.reads(text_content, fmt=fmt)
        
        # Convert to JSON string
        notebook_json = nbformat.writes(notebook)
        
        return {
            "success": True,
            "message": "Text converted to notebook successfully",
            "notebook_json": notebook_json,
            "cell_count": len(notebook.get('cells', []))
        }
            
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to convert text to notebook: {str(e)}"
        }


def convert_notebook_content_to_text_with_preservation(
    notebook_content: str, 
    format_name: str = "py:percent"
) -> dict:
    """Convert notebook content string to text with comprehensive preservation data."""
    try:
        import jupytext
        import nbformat
        
        # Parse the notebook content
        original_notebook = nbformat.reads(notebook_content, as_version=nbformat.NO_CONVERT)
        
        # Convert to text using jupytext
        converted_text = jupytext.writes(original_notebook, format_name)
        
        # Extract comprehensive cell information for preservation
        cell_data = []
        for i, cell in enumerate(original_notebook.get('cells', [])):
            cell_info = {
                "index": i,
                "cell_type": cell.get('cell_type', 'unknown'),
                "source": cell.get('source', ''),
                "metadata": cell.get('metadata', {}),
                "id": cell.get('id', f'cell-{i}')
            }
            
            # Preserve outputs for code cells
            if cell.get('cell_type') == 'code':
                cell_info['outputs'] = cell.get('outputs', [])
                cell_info['execution_count'] = cell.get('execution_count')
            
            # Preserve attachments for markdown cells
            if cell.get('cell_type') == 'markdown':
                cell_info['attachments'] = cell.get('attachments', {})
            
            cell_data.append(cell_info)
        
        # Create comprehensive preservation data
        preservation_data = {
            "originalNotebook": dict(original_notebook),
            "cellData": cell_data,
            "nbformat": original_notebook.get('nbformat', 4),
            "nbformat_minor": original_notebook.get('nbformat_minor', 2),
            "metadata": original_notebook.get('metadata', {}),
            "filePath": ""  # Will be set by the document manager if needed
        }
        
        return {
            "success": True,
            "message": "Notebook content converted with preservation successfully",
            "text": converted_text,
            "preservation_data": preservation_data,
            "cell_count": len(cell_data)
        }
            
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to convert notebook content with preservation: {str(e)}"
        }


def convert_text_to_notebook_with_preservation(
    text_content: str,
    preservation_data: dict,
    format_name: str = "py:percent"
) -> dict:
    """Convert text to notebook format with smart merging to preserve unchanged cell outputs."""
    try:
        import jupytext
        import nbformat
        import difflib
        
        # Normalize format name
        if format_name == "percent":
            fmt = "py:percent"
        else:
            fmt = format_name

        # Convert the new text to a notebook structure using jupytext
        new_notebook = jupytext.reads(text_content, fmt=fmt)
        
        # Get preservation data
        original_notebook = preservation_data.get("originalNotebook", {})
        original_cell_data = preservation_data.get("cellData", [])
        
        # Create comprehensive merged notebook preserving all original metadata
        merged_notebook = {
            "nbformat": preservation_data.get("nbformat", 4),
            "nbformat_minor": preservation_data.get("nbformat_minor", 2),
            "metadata": preservation_data.get("metadata", {}),
            "cells": []
        }
        
        # Create a mapping of source text to original cell data for fast lookup
        original_source_to_cell = {cell.get('source', ''): cell for cell in original_cell_data}
        
        # Process cells with intelligent matching
        new_cells = new_notebook.get('cells', [])
        merged_cells = []
        
        for new_cell in new_cells:
            new_source = new_cell.get('source', '')
            
            # Check if the new cell's source matches an original cell's source
            if new_source in original_source_to_cell:
                original_cell = original_source_to_cell[new_source]
                
                # Preserve outputs and execution count for unchanged code cells
                if new_cell.get('cell_type') == 'code' and original_cell.get('cell_type') == 'code':
                    merged_cell = dict(new_cell)
                    merged_cell['outputs'] = original_cell.get('outputs', [])
                    merged_cell['execution_count'] = original_cell.get('execution_count')
                    merged_cells.append(merged_cell)
                else:
                    # For other cell types or changed types, use the new cell as-is
                    merged_cells.append(new_cell)
            else:
                # Completely new cell - use as-is but ensure proper structure
                merged_cell = dict(new_cell)
                if merged_cell.get("cell_type") == "code":
                    merged_cell.setdefault("outputs", [])
                    merged_cell.setdefault("execution_count", None)
                elif merged_cell.get("cell_type") == "markdown":
                    merged_cell.setdefault("attachments", {})
                
                merged_cells.append(merged_cell)
        
        merged_notebook["cells"] = merged_cells
        
        # Convert merged notebook to JSON string
        result_json = nbformat.writes(merged_notebook)
        
        return {
            "success": True,
            "message": "Text converted to notebook with preservation successfully",
            "notebook_json": result_json,
            "original_cell_count": len(original_cell_data),
            "new_cell_count": len(new_cells),
            "merged_cell_count": len(merged_cells),
            "preserved_outputs": sum(1 for cell in merged_cells if cell.get("cell_type") == "code" and cell.get("outputs"))
        }
            
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to convert text to notebook with preservation: {str(e)}"
        }


def check_jupytext_installation():
    """Check if jupytext is available."""
    try:
        import jupytext
        import nbformat
        return True
    except ImportError:
        return False


def main():
    parser = argparse.ArgumentParser(description='In-memory Jupytext conversion utility for VSCode erdos-python extension')
    
    subparsers = parser.add_subparsers(dest='operation', required=True, help='Conversion operations')
    
    # check-installation
    check_install = subparsers.add_parser('check-installation', help='Check if jupytext is installed')
    
    # notebook-content-to-text
    nb_content_to_text = subparsers.add_parser('notebook-content-to-text', help='Convert notebook content to text')
    nb_content_to_text.add_argument('--notebook-content', required=True, help='Notebook content as JSON string')
    nb_content_to_text.add_argument('--format', default='py:percent', help='Jupytext format (default: py:percent)')
    
    # text-to-notebook
    text_to_nb = subparsers.add_parser('text-to-notebook', help='Convert text to notebook')
    text_to_nb.add_argument('--text-content', required=True, help='Text content to convert')
    text_to_nb.add_argument('--format', default='py:percent', help='Jupytext format (default: py:percent)')
    
    # notebook-content-to-text-with-preservation
    nb_content_preserve = subparsers.add_parser('notebook-content-to-text-with-preservation', help='Convert notebook content to text with preservation')
    nb_content_preserve.add_argument('--notebook-content', required=True, help='Notebook content as JSON string')
    nb_content_preserve.add_argument('--format', default='py:percent', help='Jupytext format (default: py:percent)')
    
    # text-to-notebook-with-preservation
    text_preserve = subparsers.add_parser('text-to-notebook-with-preservation', help='Convert text to notebook with preservation')
    text_preserve.add_argument('--text-content', required=True, help='Text content to convert')
    text_preserve.add_argument('--preservation-data', required=True, help='Preservation data as JSON string')
    text_preserve.add_argument('--format', default='py:percent', help='Jupytext format (default: py:percent)')
    
    args = parser.parse_args()
    
    try:
        if args.operation == 'check-installation':
            if check_jupytext_installation():
                result = {"success": True, "message": "Jupytext is available"}
            else:
                result = {"success": False, "error": "Jupytext is not available"}
        
        elif args.operation == 'notebook-content-to-text':
            if not check_jupytext_installation():
                result = {"success": False, "error": "jupytext not installed"}
            else:
                result = convert_notebook_content_to_text(args.notebook_content, args.format)
        
        elif args.operation == 'text-to-notebook':
            if not check_jupytext_installation():
                result = {"success": False, "error": "jupytext not installed"}
            else:
                result = convert_text_to_notebook_content(args.text_content, args.format)
        
        elif args.operation == 'notebook-content-to-text-with-preservation':
            if not check_jupytext_installation():
                result = {"success": False, "error": "jupytext not installed"}
            else:
                result = convert_notebook_content_to_text_with_preservation(args.notebook_content, args.format)
        
        elif args.operation == 'text-to-notebook-with-preservation':
            if not check_jupytext_installation():
                result = {"success": False, "error": "jupytext not installed"}
            else:
                try:
                    preservation_data = json.loads(args.preservation_data)
                except json.JSONDecodeError as e:
                    result = {"success": False, "error": f"Invalid preservation data JSON: {str(e)}"}
                else:
                    result = convert_text_to_notebook_with_preservation(args.text_content, preservation_data, args.format)
        
        else:
            result = {"success": False, "error": "Unknown operation"}
        
        print(json.dumps(result))
            
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Script execution failed: {str(e)}"}))

if __name__ == "__main__":
    main()