# Copyright (c) Lotas Inc. All rights reserved.
# Licensed under the MIT License.

import json
import sys


def convert_text_to_notebook_content(text_content, format_name="py:percent"):
    """Convert text content to notebook format."""
    try:
        import jupytext
        import nbformat
        
        # Convert text to notebook using jupytext with string format
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


def convert_notebook_content_to_text_with_preservation(notebook_content, format_name="py:percent"):
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


def convert_text_to_notebook_with_preservation(text_content, preservation_data, format_name="py:percent"):
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
        original_source_map = {}
        for original_cell in original_cell_data:
            source_text = original_cell.get('source', '')
            if isinstance(source_text, list):
                source_text = ''.join(source_text)
            source_text = source_text.strip()
            if source_text:
                original_source_map[source_text] = original_cell
        
        # Match new cells with original cells to preserve outputs
        for new_cell in new_cells:
            new_source = new_cell.get('source', '')
            if isinstance(new_source, list):
                new_source = ''.join(new_source)
            new_source = new_source.strip()
            
            if new_source and new_source in original_source_map:
                # Exact match found - merge with preserved data
                original_cell = original_source_map[new_source]
                merged_cell = dict(new_cell)  # Start with new cell structure
                
                # Preserve outputs and execution count for code cells
                if (merged_cell.get("cell_type") == "code" and 
                    original_cell.get("cell_type") == "code"):
                    merged_cell["outputs"] = original_cell.get("outputs", [])
                    merged_cell["execution_count"] = original_cell.get("execution_count")
                
                # Preserve attachments for markdown cells
                if (merged_cell.get("cell_type") == "markdown" and 
                    original_cell.get("cell_type") == "markdown"):
                    merged_cell["attachments"] = original_cell.get("attachments", {})
                
                # Preserve original cell ID if available
                if "id" in original_cell:
                    merged_cell["id"] = original_cell["id"]
                
                merged_cells.append(merged_cell)
            else:
                # No exact match - try fuzzy matching for slight modifications
                best_match = None
                best_ratio = 0.8  # Minimum similarity threshold
                
                for original_source, original_cell in original_source_map.items():
                    if original_cell.get("cell_type") == new_cell.get("cell_type"):
                        ratio = difflib.SequenceMatcher(None, new_source, original_source).ratio()
                        if ratio > best_ratio:
                            best_ratio = ratio
                            best_match = original_cell
                
                if best_match:
                    # Fuzzy match found - merge with preserved data
                    merged_cell = dict(new_cell)
                    
                    if (merged_cell.get("cell_type") == "code" and 
                        best_match.get("cell_type") == "code"):
                        merged_cell["outputs"] = best_match.get("outputs", [])
                        merged_cell["execution_count"] = best_match.get("execution_count")
                    
                    if (merged_cell.get("cell_type") == "markdown" and 
                        best_match.get("cell_type") == "markdown"):
                        merged_cell["attachments"] = best_match.get("attachments", {})
                    
                    if "id" in best_match:
                        merged_cell["id"] = best_match["id"]
                    
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


def check_jupytext_installation():
    """Check if jupytext is available."""
    try:
        import jupytext
        import nbformat
        return True
    except ImportError:
        return False
