#!/usr/bin/env python3
"""
In-memory jupytext converter script for VSCode erdos-python extension.
Handles notebook-to-text and text-to-notebook conversions entirely in memory.
"""

import argparse
import json
import sys
import base64
from typing import Any, Dict, List, Optional


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
        
        # Convert text to notebook using jupytext
        notebook = jupytext.reads(text_content, fmt=format_name)
        
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
        
        # Convert the new text to a notebook structure using jupytext
        new_notebook = jupytext.reads(text_content, fmt=format_name)
        
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
        
        # Process cells with intelligent matching
        new_cells = new_notebook.get('cells', [])
        merged_cells = []
        
        # Create a mapping of source text to original cell data for fast lookup
        original_cell_map = {}
        for cell_data in original_cell_data:
            source = cell_data.get('source', '')
            if isinstance(source, list):
                source = ''.join(source)
            
            # Normalize source for comparison (strip whitespace)
            normalized_source = source.strip()
            if normalized_source:
                original_cell_map[normalized_source] = cell_data
        
        # Process each new cell
        for new_cell in new_cells:
            new_source = new_cell.get('source', '')
            if isinstance(new_source, list):
                new_source = ''.join(new_source)
            
            normalized_new_source = new_source.strip()
            
            # Try to find exact match first
            if normalized_new_source in original_cell_map:
                original_cell_data = original_cell_map[normalized_new_source]
                
                # Create merged cell preserving all original properties
                merged_cell = {
                    "cell_type": original_cell_data.get("cell_type", new_cell.get("cell_type")),
                    "source": new_cell.get("source"),  # Use new source (might have formatting changes)
                    "metadata": original_cell_data.get("metadata", {}),
                    "id": original_cell_data.get("id", new_cell.get("id"))
                }
                
                # Preserve outputs and execution count for code cells
                if merged_cell["cell_type"] == "code":
                    merged_cell["outputs"] = original_cell_data.get("outputs", [])
                    merged_cell["execution_count"] = original_cell_data.get("execution_count")
                
                # Preserve attachments for markdown cells
                if merged_cell["cell_type"] == "markdown":
                    merged_cell["attachments"] = original_cell_data.get("attachments", {})
                
                merged_cells.append(merged_cell)
            else:
                # No exact match found - try fuzzy matching for slightly modified cells
                best_match = None
                best_ratio = 0.0
                
                for source_key, cell_data in original_cell_map.items():
                    if cell_data.get("cell_type") == new_cell.get("cell_type"):
                        ratio = difflib.SequenceMatcher(None, normalized_new_source, source_key).ratio()
                        if ratio > best_ratio and ratio > 0.8:  # 80% similarity threshold
                            best_ratio = ratio
                            best_match = cell_data
                
                if best_match:
                    # Use best match but with new source
                    merged_cell = {
                        "cell_type": best_match.get("cell_type", new_cell.get("cell_type")),
                        "source": new_cell.get("source"),
                        "metadata": best_match.get("metadata", {}),
                        "id": best_match.get("id", new_cell.get("id"))
                    }
                    
                    if merged_cell["cell_type"] == "code":
                        # For modified code cells, clear outputs since code changed
                        merged_cell["outputs"] = []
                        merged_cell["execution_count"] = None
                    elif merged_cell["cell_type"] == "markdown":
                        merged_cell["attachments"] = best_match.get("attachments", {})
                    
                    merged_cells.append(merged_cell)
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


def check_jupytext_installation() -> bool:
    """Check if jupytext is available."""
    try:
        import jupytext
        import json
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
        sys.exit(0 if result.get("success", False) else 1)
        
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()