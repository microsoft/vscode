#!/usr/bin/env python3
"""
Python runner for Sculpt-n-Code that uses source-to-source translation to inject logging.

This module implements a source-to-source transformation approach for capturing runtime
values in Python code. Instead of using runtime tracing (like sys.settrace), it:

1. Parses user code into an Abstract Syntax Tree (AST)
2. Transforms the AST by injecting logging statements
3. Generates new Python code with embedded logging calls
4. Executes the transformed code to capture visualization data
5. Outputs JSON-formatted visualization data for the VS Code frontend

The main flow is:
User Code → AST Parsing → AST Transformation → Code Generation → Execution → JSON Output
"""

from dataclasses import dataclass
import sys
import json
import ast
import html
import traceback
import os
import importlib.util
import glob
import time
import hashlib
from contextlib import redirect_stdout, redirect_stderr
from io import StringIO
from typing import List, Dict, Any, Optional, Callable, Protocol, TextIO, cast

# Global state for logging - shared between the logging functions and main execution
# These variables accumulate data as the transformed code executes
execution_step = 0  # Incremental counter for each logged event
line_emit_counter: Dict[int, int] = {}  # Per-line item index during a run

_loaded_visualizers = []

# Source code context for visualizers (set before execution)
_source_code: str = ""

# Prefer the original stdout stream for streaming messages; fall back to sys.stdout.
try:
	_stream_out: TextIO = cast(TextIO, getattr(sys, '__stdout__', None)) or sys.stdout  # type: ignore[assignment]
except Exception:
	_stream_out = sys.stdout  # type: ignore[assignment]


# list of:
# {
# 	"lineNumber": int,
# 	"visIndex": int,
# 	"events": List[Dict[str, Any]],
# 	"model": Any # May not be present
# }
models_and_events: List[Dict[str, Any]] = []
models_and_events_json = os.environ.get('SNC_MODELS_AND_EVENTS', '')
models_and_events = json.loads(models_and_events_json) if (models_and_events_json and models_and_events_json.strip()) else []
# models_and_events = []
if not isinstance(models_and_events, list):
	_stream_out.write(json.dumps({"type": "vis_error", "error": f"Expected SNC_MODELS_AND_EVENTS to be a JSON of a list of dicts, but it parsed as {str(type(SNC_MODELS_AND_EVENTS))}"}, ensure_ascii=False) + "\n")
	_stream_out.flush()
if not all(isinstance(ev, dict) for ev in models_and_events):
	types_got = set(str(type(ev)) for ev in models_and_events)
	_stream_out.write(json.dumps({"type": "vis_error", "error": f"Expected SNC_MODELS_AND_EVENTS to be a JSON of a list of dicts, the items were {types_got}"}, ensure_ascii=False) + "\n")
	_stream_out.flush()


# List of directory paths to search for visualizers:
# 1. .snc/ (project-specific visualizers)
# 2. ~/.snc/ (user-global visualizers)
# 3. <python_runner_dir>/visualizers/ (built-in system visualizers)
search_paths = [
	os.path.join(os.getcwd(), '.snc_visualizers'),
	os.path.expanduser('~/.snc_visualizers'),
	os.path.join(os.path.dirname(os.path.abspath(__file__)), 'visualizers')
]

# This is the only way to make a Module type in Python
class StaticVisualizer(Protocol):
	can_visualize: Callable[[Any], bool]
	visualize: Callable[[Any], str]  # takes value

class Visualizer(Protocol):
	can_visualize: Callable[[Any], bool]
	visualize: Callable[[Any, Any], str]  # takes value, model
	init_model: Callable[[Any], Any]  # takes value
	update: Callable[[Any, Any, Any, Any, Any], Any]  # takes ui_event, source code, source line, model, value; returns (new model, commands)

# Currently, models are persist in the JS UI and are only provided on UI events (which is wrong)
@dataclass(frozen=True, slots=True)
class UnknownModel:
	pass

def log_value(line: int, value: Any, last_line_in_containing_loop: int | None = None) -> None:
	"""
	Log any runtime value for visualization using the custom visualizer system.

	This function now uses the pluggable visualizer system to generate HTML representations
	of runtime values, falling back to the default repr() approach if no custom visualizer
	is available.

	Args:
		line: The original line number from the source code
		value: The value to be logged (can be any type including error messages)
		last_line_in_containing_loop: The last line of the loop containing this value (None if not in a loop)
	"""
	global execution_step, line_emit_counter
	execution_step += 1

	vis = next((v for v in _visualizers() if v.can_visualize(value)), None)
	model = UnknownModel()
	commands = []

	# Compute this item's index among items on the same line for this run
	idx_in_line = line_emit_counter.get(line, 0)
	line_emit_counter[line] = idx_in_line + 1

	if vis is not None:
		try:
			item_model_and_event = next((m_e for m_e in models_and_events if m_e.get('line') == line and m_e.get('visIndex') == idx_in_line), {})

			if 'model' in item_model_and_event:
				model = item_model_and_event['model']
			elif callable(getattr(vis, 'init_model', None)):
				model = cast(Visualizer, vis).init_model(value)
			else:
				model = UnknownModel()

			# Apply all the events in order, collecting any commands
			if model != UnknownModel() and callable(getattr(vis, 'update', None)) and 'events' in item_model_and_event:
				updater = cast(Visualizer, vis).update
				for ev in item_model_and_event['events']:
					# Add source context to the event
					model, cmds = updater(ev, _source_code, line, model, value)
					commands.extend(cmds)

			if callable(getattr(vis, 'init_model', None)):
				vis_ = cast(Visualizer, vis)
				if model == UnknownModel(): # eventually the front end should send all models OR each back end fork keep the models
					html_content = vis_.visualize(value, vis_.init_model(value))
				else:
					html_content = vis_.visualize(value, model)
			else:
				html_content = cast(StaticVisualizer, vis).visualize(value)

			assert isinstance(html_content, str)

		except Exception as vis_err:
			html_content = html.escape(f"[Error visualizing value: {type(vis_err).__name__}: {vis_err}]")
	else:
		html_content = html.escape(repr(value))

	# Add to the global visualization data that will be output as JSON
	item = {
		"line": line,
		"visIndex": idx_in_line,
		"execution_step": execution_step,
		"html": html_content
	}
	if model != UnknownModel():
		item["model"] = model

	if last_line_in_containing_loop is not None:
		item["last_line_in_containing_loop"] = last_line_in_containing_loop

	# Stream this item immediately to stdout (bypassing redirected stdout)
	try:
		_stream_out.write(json.dumps({"type": "item", "item": item}, ensure_ascii=False) + "\n")
		_stream_out.flush()
	except Exception:
		# Never let streaming failure break user program execution
		pass

	# Stream any commands from the visualizer
	for cmd in commands:
		try:
			# Commands are dataclasses, convert to dict for JSON
			cmd_dict = {"type": type(cmd).__name__}
			if hasattr(cmd, '__dataclass_fields__'):
				for field_name in cmd.__dataclass_fields__:
					cmd_dict[field_name] = getattr(cmd, field_name)
			_stream_out.write(json.dumps({"type": "command", "command": cmd_dict}, ensure_ascii=False) + "\n")
			_stream_out.flush()
		except Exception:
			pass

def log_and_return(line: int, value: Any, last_line_in_containing_loop: int | None = None) -> Any:
	"""
	Log a value for visualization and return it unchanged.

	This helper function is used by the print transformation to log the first
	argument of print statements while preserving the original print behavior.

	Args:
		line: The original line number from the source code
		value: The value to be logged and returned
		last_line_in_containing_loop: The last line of the loop containing this value (None if not in a loop)

	Returns:
		The same value that was passed in, unchanged
	"""
	# Log the value using the standard logging function
	log_value(line, value, last_line_in_containing_loop)

	# Return the value unchanged so it can be used inline
	return value

def _visualizer_from_file(filepath: str) -> Optional[Visualizer]:
	"""Load a visualizer module from a Python file."""
	try:
		spec = importlib.util.spec_from_file_location("visualizer", filepath)
		if spec is None or spec.loader is None:
			return None

		module = importlib.util.module_from_spec(spec)
		spec.loader.exec_module(module)

	except Exception:
		return None

	if not hasattr(module, 'can_visualize') or not hasattr(module, 'visualize'):
		return None

	if not callable(module.can_visualize) or not callable(module.visualize):
		return None

	# At runtime we validated presence and callability; inform type checker
	return cast(Visualizer, module)


def _visualizers() -> List[StaticVisualizer | Visualizer]:
	"""
	Discover and load all visualizer files from the search directories.

	Returns:
		List of loaded visualizer dictionaries, in priority order (first found wins)
	"""
	if len(_loaded_visualizers) > 0:
		return _loaded_visualizers

	for dir in search_paths:
		if not os.path.isdir(dir):
			continue

		for filepath in glob.glob(os.path.join(dir, '*_visualizer.py')):
			visualizer = _visualizer_from_file(filepath)
			if visualizer is not None:
				_loaded_visualizers.append(visualizer)

	return _loaded_visualizers


# ============================================================================
# PRELOADING INFRASTRUCTURE
# Fork-based checkpointing for fast execution
# ============================================================================

_visualizers_hash = ""  # Hash of visualizer files for cache invalidation


def emit_meta(meta: str) -> None:
	"""Emit a meta message for debugging/timing."""
	try:
		_stream_out.write(json.dumps({"type": "meta", "meta": meta, "t": time.time()}, ensure_ascii=False) + "\n")
		_stream_out.flush()
	except Exception:
		pass


def emit_checkpoint_ready(checkpoint: int, code_hash: str = "", visualizers_hash: str = "") -> None:
	"""Emit a message indicating a checkpoint is ready for forking."""
	try:
		msg = {
			"type": "checkpoint_ready",
			"checkpoint": checkpoint,
			"pid": os.getpid(),
			"code_hash": code_hash,
			"visualizers_hash": visualizers_hash
		}
		_stream_out.write(json.dumps(msg, ensure_ascii=False) + "\n")
		_stream_out.flush()
	except Exception:
		pass


def emit_fork_result(success: bool, child_pid: int = 0, error: str = "") -> None:
	"""Emit result of a fork operation."""
	try:
		msg = {
			"type": "fork_result",
			"success": success,
			"child_pid": child_pid,
			"error": error
		}
		_stream_out.write(json.dumps(msg, ensure_ascii=False) + "\n")
		_stream_out.flush()
	except Exception:
		pass


def _compute_visualizers_hash() -> str:
	"""Compute a hash of all visualizer files for cache invalidation."""
	hasher = hashlib.md5()
	for dir in search_paths:
		if not os.path.isdir(dir):
			continue
		for filepath in sorted(glob.glob(os.path.join(dir, '*_visualizer.py'))):
			try:
				with open(filepath, 'rb') as f:
					hasher.update(filepath.encode())
					hasher.update(f.read())
			except Exception:
				pass
	return hasher.hexdigest()


def _preload_visualizers() -> str:
	"""Preload all visualizers and return the hash."""
	global _visualizers_hash
	_visualizers()
	_visualizers_hash = _compute_visualizers_hash()
	return _visualizers_hash


def compute_code_hash(code: str) -> str:
	"""Compute a hash of the code for checkpoint identification."""
	return hashlib.md5(code.encode()).hexdigest()


class CodeTransformer(ast.NodeTransformer):
	"""
	AST transformer that injects logging statements into Python code.

	This class inherits from ast.NodeTransformer, which provides a visitor pattern
	for traversing and modifying Abstract Syntax Trees. Each visit_* method
	corresponds to a specific AST node type (assignments, if statements, etc.).

	The transformer works by:
	1. Walking through each node in the AST
	2. For nodes we want to log (assignments, conditionals, loops), creating
	   new AST nodes that include logging calls
	3. Using temporary variables to avoid side effects and ensure we capture
	   the exact values that were computed

	The simplified logging function (_log_value) is injected into the transformed
	code and called at runtime for all types of values.

	Adds an underscore to the function to avoid infinite loop when we run it on this file itself.
	"""

	def __init__(self):
		"""Initialize the transformer with a counter for generating unique temp variables."""
		self.temp_var_counter = 0  # Used to generate unique temporary variable names
		self.loop_context_stack = []  # Stack of loop end lines

	def _get_temp_var(self) -> str:
		"""
		Generate a unique temporary variable name.

		These temporary variables are used to store intermediate values so we can
		log them without affecting the original program's behavior. For example,
		instead of logging "x + 2" directly (which might have side effects if
		evaluated multiple times), we store it in a temp variable first.

		Returns:
			A unique variable name like "_snc_temp_1", "_snc_temp_2", etc.
		"""
		self.temp_var_counter += 1
		return f"_snc_temp_{self.temp_var_counter}"

	def _get_current_loop_end_line(self) -> Optional[int]:
		"""
		Get the end line of the current loop context.

		Returns:
			The end line of the innermost loop, or None if not in a loop
		"""
		return self.loop_context_stack[-1] if self.loop_context_stack else None

	def _calculate_loop_end_line(self, body_statements: List[ast.stmt]) -> int:
		"""
		Calculate the end line of a loop by finding the maximum line number in its body.

		Args:
			body_statements: List of statements in the loop body

		Returns:
			The line number of the last statement in the loop body
		"""
		if not body_statements:
			return 0

		max_line = 0
		for stmt in body_statements:
			if hasattr(stmt, 'lineno'):
				max_line = max(max_line, stmt.lineno)
			if hasattr(stmt, 'end_lineno') and stmt.end_lineno:
				max_line = max(max_line, stmt.end_lineno)
		return max_line

	def _create_assignment(self, target_id: str, value: ast.expr, lineno: int, col_offset: int) -> ast.Assign:
		"""
		Helper to create an AST assignment node with proper location information.

		Args:
			target_id: The variable name to assign to
			value: The expression to assign
			lineno: Line number for the AST node
			col_offset: Column offset for the AST node

		Returns:
			An AST assignment node with valid location ranges
		"""
		# Create the target name node with proper locations
		target_name = ast.Name(
			id=target_id,
			ctx=ast.Store(),
			lineno=lineno,
			col_offset=col_offset,
			end_lineno=lineno,
			end_col_offset=col_offset + len(target_id)
		)

		# Estimate the end position for the entire assignment
		end_col = col_offset + len(target_id) + 3  # "var = "
		if hasattr(value, 'end_col_offset') and value.end_col_offset is not None:
			end_col = max(end_col, value.end_col_offset)
		else:
			end_col += 10  # Reasonable estimate for RHS

		return ast.Assign(
			targets=[target_name],
			value=value,
			lineno=lineno,
			col_offset=col_offset,
			end_lineno=lineno,
			end_col_offset=end_col
		)

	def _create_log_call(self, func_name: str, line: int, var_name: str, lineno: int, col_offset: int) -> ast.Expr:
		"""
		Helper to create a logging function call with loop context information.

		Args:
			func_name: Name of the logging function to call
			line: The original line number to log
			var_name: The variable name containing the value to log
			lineno: Line number for the AST node
			col_offset: Column offset for the AST node

		Returns:
			An AST expression statement containing the function call with valid location ranges
		"""
		# Create function name node with proper locations
		func_node = ast.Name(
			id=func_name,
			ctx=ast.Load(),
			lineno=lineno,
			col_offset=col_offset,
			end_lineno=lineno,
			end_col_offset=col_offset + len(func_name)
		)

		# Create constant argument for line number
		line_const = ast.Constant(
			value=line,
			lineno=lineno,
			col_offset=col_offset + len(func_name) + 1,  # After "func_name("
			end_lineno=lineno,
			end_col_offset=col_offset + len(func_name) + 1 + len(str(line))
		)

		# Create variable name argument
		var_arg_col = col_offset + len(func_name) + 1 + len(str(line)) + 2  # After "func_name(line, "
		var_node = ast.Name(
			id=var_name,
			ctx=ast.Load(),
			lineno=lineno,
			col_offset=var_arg_col,
			end_lineno=lineno,
			end_col_offset=var_arg_col + len(var_name)
		)

		# Build the arguments list
		args = [line_const, var_node]

		# Add loop context if we're in a loop
		current_loop_end = self._get_current_loop_end_line()
		if current_loop_end is not None:
			loop_end_const = ast.Constant(
				value=current_loop_end,
				lineno=lineno,
				col_offset=var_arg_col + len(var_name) + 2,  # After "var_name, "
				end_lineno=lineno,
				end_col_offset=var_arg_col + len(var_name) + 2 + len(str(current_loop_end))
			)
			args.append(loop_end_const)

		# Create the call node
		call_end_col = var_arg_col + len(var_name) + 1  # After closing paren
		if current_loop_end is not None:
			call_end_col += 2 + len(str(current_loop_end))  # Account for third argument

		call_node = ast.Call(
			func=func_node,
			args=args,
			keywords=[],
			lineno=lineno,
			col_offset=col_offset,
			end_lineno=lineno,
			end_col_offset=call_end_col
		)

		# Create the expression statement
		return ast.Expr(
			value=call_node,
			lineno=lineno,
			col_offset=col_offset,
			end_lineno=lineno,
			end_col_offset=call_end_col
		)

	def _transform_statement_list(self, statements: List[ast.stmt]) -> List[ast.stmt]:
		"""
		Helper to recursively transform a list of statements.

		This handles the common pattern of transforming statement lists in
		if/for/while bodies and orelse clauses.

		Args:
			statements: List of statements to transform

		Returns:
			List of transformed statements (may be longer due to injected logging)
		"""
		result = []
		for stmt in statements:
			transformed = self.visit(stmt)
			if isinstance(transformed, list):
				result.extend(transformed)
			else:
				result.append(transformed)
		return result

	def visit_Assign(self, node: ast.Assign) -> List[ast.stmt]:
		"""
		Transform assignment statements to log RHS values.

		This method is called whenever the AST contains an assignment node (e.g., x = 5).
		We transform it into three statements to capture the RHS value:

		Original:  x = 5
		Becomes:   _snc_temp_1 = 5          # Store RHS in temp variable
				   x = _snc_temp_1          # Original assignment using temp
				   _log_value(1, _snc_temp_1)  # Log the value

		This approach ensures we capture the exact computed value without
		side effects, even for complex expressions like x = expensive_function().

		Args:
			node: The AST assignment node to transform

		Returns:
			List of three AST statements: temp assignment, original assignment, log call
		"""
		# First, recursively transform any nested expressions in the assignment
		node = cast(ast.Assign, self.generic_visit(node))
		assert isinstance(node, ast.Assign)

		# Create a temporary variable to store the RHS value
		temp_var = self._get_temp_var()

		# Use different column offsets to avoid conflicts
		# Original statement at col 0, temp assignment at col 1000, log call at col 2000
		temp_col = 1000
		log_col = 2000

		# Create assignment to temp variable: temp_var = RHS
		temp_assign = self._create_assignment(temp_var, node.value, node.lineno, temp_col)

		# Create temp variable name node for original assignment
		temp_var_node = ast.Name(
			id=temp_var,
			ctx=ast.Load(),
			lineno=node.lineno,
			col_offset=node.col_offset + 20,  # After LHS =
			end_lineno=node.lineno,
			end_col_offset=node.col_offset + 20 + len(temp_var)
		)

		# Create the original assignment but using temp variable: LHS = temp_var
		original_assign = ast.Assign(
			targets=node.targets,  # The original LHS (could be multiple targets)
			value=temp_var_node,  # Use temp variable as RHS
			lineno=node.lineno,
			col_offset=node.col_offset,
			end_lineno=node.lineno,
			end_col_offset=node.col_offset + 20 + len(temp_var)
		)

		# Create logging call: _log_value(line, temp_var)
		log_call = self._create_log_call('_log_value', node.lineno, temp_var, node.lineno, log_col)

		# Return all three statements as a list
		return [temp_assign, original_assign, log_call]

	def visit_AugAssign(self, node: ast.AugAssign) -> List[ast.stmt]:
		"""
		Transform augmented assignment statements to log resulting values.

		This method handles operators like +=, -=, *=, /=, etc. We want to log
		the final value after the operation, not the RHS value.

		Original:  x += 5
		Becomes:   _snc_temp_1 = x + 5        # Calculate result
		           x = _snc_temp_1            # Do the assignment
		           _log_value(1, _snc_temp_1) # Log the result

		Args:
			node: The AST augmented assignment node to transform

		Returns:
			List of three AST statements: temp assignment, original assignment, log call
		"""
		# First, recursively transform any nested expressions
		node = cast(ast.AugAssign, self.generic_visit(node))
		assert isinstance(node, ast.AugAssign)

		# Create a temporary variable to store the result
		temp_var = self._get_temp_var()

		# Use different column offsets to avoid conflicts
		temp_col = 1000
		log_col = 2000

		# Create a binary operation: target op value
		# For x += 5, this creates: x + 5
		binary_op = ast.BinOp(
			left=ast.Name(
				id=node.target.id if isinstance(node.target, ast.Name) else 'target',
				ctx=ast.Load(),
				lineno=node.lineno,
				col_offset=node.col_offset,
				end_lineno=node.lineno,
				end_col_offset=node.col_offset + 10
			),
			op=node.op,  # The operator (+, -, *, /, etc.)
			right=node.value,  # The RHS value
			lineno=node.lineno,
			col_offset=node.col_offset,
			end_lineno=node.lineno,
			end_col_offset=node.col_offset + 20
		)

		# Create assignment to temp variable: temp_var = target op value
		temp_assign = self._create_assignment(temp_var, binary_op, node.lineno, temp_col)

		# Create temp variable name node for original assignment
		temp_var_node = ast.Name(
			id=temp_var,
			ctx=ast.Load(),
			lineno=node.lineno,
			col_offset=node.col_offset + 20,
			end_lineno=node.lineno,
			end_col_offset=node.col_offset + 20 + len(temp_var)
		)

		# Create regular assignment: target = temp_var
		original_assign = ast.Assign(
			targets=[node.target],  # The original target
			value=temp_var_node,   # Use temp variable as RHS
			lineno=node.lineno,
			col_offset=node.col_offset,
			end_lineno=node.lineno,
			end_col_offset=node.col_offset + 20 + len(temp_var)
		)

		# Create logging call: _log_value(line, temp_var)
		log_call = self._create_log_call('_log_value', node.lineno, temp_var, node.lineno, log_col)

		# Return all three statements as a list
		return [temp_assign, original_assign, log_call]

	def visit_If(self, node: ast.If) -> List[ast.stmt]:
		"""Transform if statements to log condition results."""
		# Create temporary variable for condition
		temp_var = self._get_temp_var()

		# Use different column offsets to avoid conflicts
		temp_col = 1000
		log_col = 2000

		# Create assignment: temp_var = condition
		temp_assign = self._create_assignment(temp_var, node.test, node.lineno, temp_col)

		# Create logging call: _log_value(line, temp_var)
		log_call = self._create_log_call('_log_value', node.lineno, temp_var, node.lineno, log_col)

		# Transform the body and orelse recursively using helper
		new_body = self._transform_statement_list(node.body)
		new_orelse = self._transform_statement_list(node.orelse)

		# Create temp variable name node for the if condition
		temp_var_node = ast.Name(
			id=temp_var,
			ctx=ast.Load(),
			lineno=node.lineno,
			col_offset=node.col_offset + 3,  # After "if "
			end_lineno=node.lineno,
			end_col_offset=node.col_offset + 3 + len(temp_var)
		)

		# Create new if statement with temp variable as condition
		new_if = ast.If(
			test=temp_var_node,
			body=new_body,
			orelse=new_orelse,
			lineno=node.lineno,
			col_offset=node.col_offset,
			end_lineno=node.end_lineno if hasattr(node, 'end_lineno') else node.lineno,
			end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else node.col_offset + 10
		)

		# Return a list: [temp_assign, log_call, new_if]
		return [temp_assign, log_call, new_if]

	def _extract_target_names(self, target: ast.expr) -> List[str]:
		"""
		Extract all variable names from a loop target, handling both simple names and tuple unpacking.

		Args:
			target: The target expression (ast.Name for simple, ast.Tuple for unpacking)

		Returns:
			List of variable names as strings
		"""
		if isinstance(target, ast.Name):
			# Simple case: for i in range(3)
			return [target.id]
		elif isinstance(target, ast.Tuple):
			# Tuple unpacking: for a, b in zip(list1, list2)
			names = []
			for elt in target.elts:
				if isinstance(elt, ast.Name):
					names.append(elt.id)
				# Could handle nested tuples recursively, but that's rare
			return names
		else:
			# Other cases (lists, etc.) - not common in for loops
			return []

	def visit_For(self, node: ast.For) -> ast.For:
		"""Transform for loops to log iteration variables, including tuple unpacking."""
		# Calculate the end line of this loop
		loop_end_line = self._calculate_loop_end_line(node.body)

		# Push this loop context onto the stack
		self.loop_context_stack.append(loop_end_line)

		try:
			# Transform the body recursively first
			new_body = []

			# Add logging calls for all target variables (handles both simple and tuple unpacking)
			target_names = self._extract_target_names(node.target)
			for i, var_name in enumerate(target_names):
				# Use different column offsets for multiple variables to avoid conflicts
				col_offset = node.col_offset + (i * 50)
				log_call = self._create_log_call('_log_value', node.lineno, var_name, node.lineno, col_offset)
				new_body.append(log_call)

			# Add the original body statements (transformed) using helper
			new_body.extend(self._transform_statement_list(node.body))

			# Transform orelse if present using helper
			new_orelse = self._transform_statement_list(node.orelse)

			return ast.For(
				target=node.target,
				iter=self.visit(node.iter),
				body=new_body,
				orelse=new_orelse,
				lineno=node.lineno,
				col_offset=node.col_offset,
				end_lineno=node.end_lineno if hasattr(node, 'end_lineno') else node.lineno,
				end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else node.col_offset + 10
			)
		finally:
			# Pop the loop context when we're done
			self.loop_context_stack.pop()

	def visit_While(self, node: ast.While) -> ast.While:
		"""Transform while loops to log condition results and track loop context."""
		# Calculate the end line of this loop
		loop_end_line = self._calculate_loop_end_line(node.body)

		# Push this loop context onto the stack
		self.loop_context_stack.append(loop_end_line)

		try:
			# Transform body and orelse using helper functions
			new_body = self._transform_statement_list(node.body)
			new_orelse = self._transform_statement_list(node.orelse)

			return ast.While(
				test=self.visit(node.test),
				body=new_body,
				orelse=new_orelse,
				lineno=node.lineno,
				col_offset=node.col_offset,
				end_lineno=node.end_lineno if hasattr(node, 'end_lineno') else node.lineno,
				end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else node.col_offset + 10
			)
		finally:
			# Pop the loop context when we're done
			self.loop_context_stack.pop()

	def visit_Expr(self, node: ast.Expr) -> List[ast.stmt]:
		"""
		Transform bare expression statements to log their values.

		A bare expression statement is an expression that stands alone on a line,
		like "x + 5" or "func()". We want to capture and visualize the result
		of these expressions.

		Original:  x + 5
		Becomes:   _snc_temp_1 = x + 5
		           _log_value(1, _snc_temp_1)
		           _snc_temp_1  # Preserve the original expression statement
		"""
		# First, recursively transform any nested expressions
		node = cast(ast.Expr, self.generic_visit(node))

		# Skip logging for print calls since we handle them specially in visit_Call
		# This prevents showing the None return value of print() which clutters the display
		if (isinstance(node.value, ast.Call) and
			isinstance(node.value.func, ast.Name) and
			node.value.func.id == 'print'):
			# Just return the original expression without logging
			return [node]

		# Create a temporary variable to store the expression result
		temp_var = self._get_temp_var()

		# Use different column offsets to avoid conflicts
		temp_col = 1000
		log_col = 2000

		# Create assignment to temp variable: temp_var = expression
		temp_assign = self._create_assignment(temp_var, node.value, node.lineno, temp_col)

		# Create logging call: _log_value(line, temp_var)
		log_call = self._create_log_call('_log_value', node.lineno, temp_var, node.lineno, log_col)

		# Create temp variable name node for the original expression
		temp_var_node = ast.Name(
			id=temp_var,
			ctx=ast.Load(),
			lineno=node.lineno,
			col_offset=node.col_offset,
			end_lineno=node.lineno,
			end_col_offset=node.col_offset + len(temp_var)
		)

		# Create the original expression statement using temp variable
		original_expr = ast.Expr(
			value=temp_var_node,
			lineno=node.lineno,
			col_offset=node.col_offset,
			end_lineno=node.lineno,
			end_col_offset=node.col_offset + len(temp_var)
		)

		# Return all three statements as a list
		return [temp_assign, log_call, original_expr]

	def visit_Call(self, node: ast.Call) -> ast.expr:
		"""
		Transform print calls to log all their positional arguments.

		When we encounter a print() call, we want to capture and visualize
		ALL non-keyword positional arguments that are being printed.

		Original:  print("hello", "world", 123, sep="-")
		Becomes:   print(_log_and_return(line, "hello"), _log_and_return(line, "world"), _log_and_return(line, 123), sep="-")

		We inject logging for all positional arguments while preserving the
		original print call behavior and leaving keyword arguments unchanged.
		"""
		# First, recursively transform any nested expressions
		node = cast(ast.Call, self.generic_visit(node))

		# Check if this is a print call
		if (isinstance(node.func, ast.Name) and
			node.func.id == 'print' and
			len(node.args) > 0):

			# We have a print call with at least one argument
			# Transform ALL positional arguments to include logging
			new_args = []

			for i, arg in enumerate(node.args):
				# Create a call to the helper function that logs and returns the value
				# _log_and_return(line, value, loop_context) -> logs the value and returns it
				log_args = [
					ast.Constant(
						value=node.lineno,
						lineno=node.lineno,
						col_offset=node.col_offset + (i * 20) + 16,
						end_lineno=node.lineno,
						end_col_offset=node.col_offset + (i * 20) + 16 + len(str(node.lineno))
					),
					arg  # The original argument
				]

				# Add loop context if we're in a loop
				current_loop_end = self._get_current_loop_end_line()
				if current_loop_end is not None:
					loop_end_const = ast.Constant(
						value=current_loop_end,
						lineno=node.lineno,
						col_offset=node.col_offset + (i * 20) + 60,
						end_lineno=node.lineno,
						end_col_offset=node.col_offset + (i * 20) + 60 + len(str(current_loop_end))
					)
					log_args.append(loop_end_const)

				log_and_return_call = ast.Call(
					func=ast.Name(
						id='_log_and_return',
						ctx=ast.Load(),
						lineno=node.lineno,
						col_offset=node.col_offset + (i * 20),  # Offset each call to avoid conflicts
						end_lineno=node.lineno,
						end_col_offset=node.col_offset + (i * 20) + 15
					),
					args=log_args,
					keywords=[],
					lineno=node.lineno,
					col_offset=node.col_offset + (i * 20),
					end_lineno=node.lineno,
					end_col_offset=node.col_offset + (i * 20) + 50  # Rough estimate
				)

				new_args.append(log_and_return_call)

			return ast.Call(
				func=node.func,
				args=new_args,
				keywords=node.keywords,  # Preserve keyword arguments unchanged
				lineno=node.lineno,
				col_offset=node.col_offset,
				end_lineno=node.end_lineno if hasattr(node, 'end_lineno') else node.lineno,
				end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else node.col_offset + 50
			)

		# If it's not a print call, return the node unchanged
		return node

	def visit_Return(self, node: ast.Return) -> List[ast.stmt]:
		"""
		Transform return statements to log their return values.

		This method captures and visualizes the values being returned from functions.
		We want to show users what their functions are actually returning.

		Original:  return x + 5
		Becomes:   _temp_var = x + 5
		           _log_value(line, _temp_var)
		           return _temp_var

		For bare return statements (return with no value), we log None since
		that's what Python functions return by default.

		Args:
			node: The AST return node to transform

		Returns:
			List of statements: temp assignment, log call, and return statement
		"""
		# First, recursively transform any nested expressions in the return value
		node = cast(ast.Return, self.generic_visit(node))

		# Handle bare return statements (return with no expression)
		if node.value is None:
			# For bare return, we need to log None using a constant
			# Create a direct log call with None constant
			none_constant = ast.Constant(
				value=None,
				lineno=node.lineno,
				col_offset=2020,
				end_lineno=node.lineno,
				end_col_offset=2024
			)

			log_call_expr = ast.Expr(
				value=ast.Call(
					func=ast.Name(
						id='_log_value',
						ctx=ast.Load(),
						lineno=node.lineno,
						col_offset=2000,
						end_lineno=node.lineno,
						end_col_offset=2010
					),
					args=[
						ast.Constant(
							value=node.lineno,
							lineno=node.lineno,
							col_offset=2011,
							end_lineno=node.lineno,
							end_col_offset=2011 + len(str(node.lineno))
						),
						none_constant  # Use None constant instead of Name node
					],
					keywords=[],
					lineno=node.lineno,
					col_offset=2000,
					end_lineno=node.lineno,
					end_col_offset=2030
				),
				lineno=node.lineno,
				col_offset=2000,
				end_lineno=node.lineno,
				end_col_offset=2030
			)

			# Create the original return statement (bare return)
			original_return = ast.Return(
				value=None,
				lineno=node.lineno,
				col_offset=node.col_offset,
				end_lineno=node.lineno,
				end_col_offset=node.col_offset + 6  # "return" is 6 chars
			)

			return [log_call_expr, original_return]

		# Handle return statements with expressions
		# Create a temporary variable to store the return value
		temp_var = self._get_temp_var()

		# Use different column offsets to avoid conflicts
		temp_col = 1000
		log_col = 2000

		# Create assignment to temp variable: temp_var = return_expression
		temp_assign = self._create_assignment(temp_var, node.value, node.lineno, temp_col)

		# Create logging call: _log_value(line, temp_var)
		log_call = self._create_log_call('_log_value', node.lineno, temp_var, node.lineno, log_col)

		# Create temp variable name node for the return statement
		temp_var_node = ast.Name(
			id=temp_var,
			ctx=ast.Load(),
			lineno=node.lineno,
			col_offset=node.col_offset + 7,  # After "return "
			end_lineno=node.lineno,
			end_col_offset=node.col_offset + 7 + len(temp_var)
		)

		# Create the return statement using temp variable: return temp_var
		original_return = ast.Return(
			value=temp_var_node,
			lineno=node.lineno,
			col_offset=node.col_offset,
			end_lineno=node.lineno,
			end_col_offset=node.col_offset + 7 + len(temp_var)
		)

		# Return all three statements as a list
		return [temp_assign, log_call, original_return]

def extract_error_line_from_traceback(tb_str: str) -> int:
	"""
	Extract the line number where an error occurred from a traceback string.

	This function parses the traceback to find the line number in the user's code
	where the error occurred. It looks for the user code execution in the traceback,
	which appears as 'File "<string>"' when code is executed via exec().

	Args:
		tb_str: The traceback string from traceback.format_exc()

	Returns:
		The line number where the error occurred, or 1 if no line can be determined
	"""
	try:
		# Split traceback into lines and look for line number information
		lines = tb_str.strip().split('\n')

		# Look for the last occurrence of user code execution
		# User code appears as 'File "<string>", line X, in <module>'
		user_code_line = None
		for line in lines:
			if 'File "<string>"' in line and 'line' in line and 'in <module>' in line:
				# Extract line number using string parsing
				# Format is: File "<string>", line X, in <module>
				parts = line.split(',')
				for part in parts:
					if 'line' in part:
						try:
							# Extract the number after 'line'
							line_num = int(part.strip().split()[1])
							user_code_line = line_num
							break
						except (ValueError, IndexError):
							continue

		if user_code_line is not None:
			# With compiled AST, line numbers should be preserved accurately
			return user_code_line

		# Fallback: look for any line number in the traceback
		for line in lines:
			if 'line' in line.lower() and 'File' in line:
				try:
					# Try to extract any number that might be a line number
					words = line.split()
					for i, word in enumerate(words):
						if word == 'line' and i + 1 < len(words):
							line_num = int(words[i + 1].rstrip(','))
							return line_num
				except (ValueError, IndexError):
					continue

	except Exception:
		# If parsing fails completely, just return line 1
		pass

	# Default to line 1 if we can't determine the actual error line
	return 1

def transform_code_to_ast(source_code: str) -> ast.Module:
	"""
	Transform the source code by injecting logging statements, returning an AST.

	This function coordinates the AST transformation process while preserving
	original line numbers. Unlike the previous approach that converted the AST
	back to a string, this returns the transformed AST directly, which allows
	us to compile it to a code object that preserves line number information.

	The transformation process:
	1. Parse the source code into an Abstract Syntax Tree (AST)
	2. Use CodeTransformer to walk the AST and inject logging statements
	3. Return the transformed AST with preserved line numbers

	Args:
		source_code: The original Python code as a string

	Returns:
		The transformed AST with logging statements injected, can raise an error
	"""
	# Parse the source code into an AST
	# This converts the string code into a tree structure we can manipulate
	tree = ast.parse(source_code)

	# Transform the AST using our custom transformer
	# This is where the magic happens - assignments, conditionals, and loops
	# get transformed to include logging calls
	transformer = CodeTransformer()

	# Transform each statement in the module
	# Some transformations return single nodes, others return lists of nodes
	new_body = []
	for stmt in tree.body:
		transformed = transformer.visit(stmt)
		if isinstance(transformed, list):
			# If transformation returned multiple statements (e.g., assignment transformation)
			new_body.extend(transformed)
		else:
			# If transformation returned a single statement
			new_body.append(transformed)

	# Create new module with transformed statements
	# This rebuilds the AST with our modifications
	new_tree = ast.Module(body=new_body, type_ignores=[])

	# This ensures that error tracebacks point to the correct lines
	# We need to be more careful about line number assignment
	for node in ast.walk(new_tree):
		if hasattr(node, 'lineno') and not hasattr(node, 'col_offset'):
			setattr(node, 'col_offset', 0)
		if hasattr(node, 'end_lineno') and not hasattr(node, 'end_col_offset'):
			setattr(node, 'end_col_offset', 0)

	ast.fix_missing_locations(new_tree)

	return new_tree


def run_with_visualization(code: str) -> Dict[str, Any]:
	"""
	Run the given code with visualization logging using source-to-source translation.

	This is the main entry point that orchestrates the entire process:
	1. Reset global state for a fresh run
	2. Transform the user's code to inject logging, these are streamed to stdout as NDJSON
	3. Execute the transformed code in a controlled environment
	4. Return a JSON-serializable dictionary containing stdout, stderr, and exitCode

	Args:
		code: The user's Python code as a string

	Returns:
		A dict: {
			"stdout": str,
			"stderr": str,
			"exitCode": int
		}
	"""
	# Handle empty program
	if code.strip() == "":
		return {
			"stdout": "",
			"stderr": "",
			"exitCode": 0
		}

	global execution_step, line_emit_counter, _source_code
	# Reset global state for each run to ensure clean slate
	execution_step = 0       # Reset execution counter
	line_emit_counter = {}   # Reset per-line item counters
	_source_code = code      # Store source code for visualizers to access

	# Transform and compile
	transformed_ast = transform_code_to_ast(code)

	# Optional: write transformed code for debugging (enable by setting SNC_WRITE_TRANSFORMED=1)
	if os.environ.get('SNC_WRITE_TRANSFORMED'):
		with open('transformed.py', 'w') as f:
			try:
				transformed_code = ast.unparse(transformed_ast)
				print(transformed_code, file=f)
			except Exception as unparse_error:
				print(f"Warning: Could not unparse transformed AST: {unparse_error}", file=f)

	code_object = compile(transformed_ast, filename='<string>', mode='exec')

	# Prepare globals for execution - include our logging functions
	globals_dict = {
		'__name__': '__main__',
		'__file__': '<string>',
		'_log_value': log_value,
		'_log_and_return': log_and_return
	}

	sys.argv = []  # Prevent infinite recursion when we run this on itself

	# Capture user program stdout/stderr
	out_buf = StringIO()
	err_buf = StringIO()
	exit_code = 0

	with redirect_stdout(out_buf), redirect_stderr(err_buf):
		try:
			exec(code_object, globals_dict)
		except Exception as e:
			# Capture any errors (syntax errors, runtime exceptions, etc.)
			tb_str = traceback.format_exc()

			# Extract error information
			error_type = type(e).__name__
			error_message = str(e)
			error_line = extract_error_line_from_traceback(tb_str)

			# Create error visualization entry
			error_msg_str = f"{error_type}: {error_message}"
			log_value(error_line, error_msg_str)

			# Also write traceback to captured stderr
			print(tb_str, file=sys.stderr)
			exit_code = 1

	return {
		"stdout": out_buf.getvalue(),
		"stderr": err_buf.getvalue(),
		"exitCode": exit_code
	}


# ============================================================================
# PRELOAD MODE FUNCTIONS
# ============================================================================


def execute_code(code_object: Any, globals_dict: Dict[str, Any]) -> Dict[str, Any]:
	"""Execute compiled code and return result with stdout/stderr/exitCode."""
	out_buf = StringIO()
	err_buf = StringIO()
	exit_code = 0

	with redirect_stdout(out_buf), redirect_stderr(err_buf):
		emit_meta('exec-start')
		try:
			exec(code_object, globals_dict)
		except Exception as e:
			tb_str = traceback.format_exc()
			error_type = type(e).__name__
			error_message = str(e)
			error_line = extract_error_line_from_traceback(tb_str)
			error_msg_str = f"{error_type}: {error_message}"
			log_value(error_line, error_msg_str)
			print(tb_str, file=sys.stderr)
			exit_code = 1

	return {
		"stdout": out_buf.getvalue(),
		"stderr": err_buf.getvalue(),
		"exitCode": exit_code
	}


def _execute_run(code_object: Any, models_and_events_json: str, run_id: str) -> None:
	"""Execute a run with the given code object and models/events."""
	global models_and_events, execution_step, line_emit_counter

	execution_step = 0
	line_emit_counter = {}

	if models_and_events_json and models_and_events_json.strip():
		try:
			models_and_events = json.loads(models_and_events_json)
		except Exception:
			models_and_events = []
	else:
		models_and_events = []

	globals_dict = {
		'__name__': '__main__',
		'__file__': '<string>',
		'_log_value': log_value,
		'_log_and_return': log_and_return
	}
	sys.argv = []

	result = execute_code(code_object, globals_dict)
	_stream_out.write(json.dumps({"type": "end", "result": result, "run_id": run_id}) + "\n")
	_stream_out.flush()


def run_preload_mode(working_directory: str) -> None:
	"""
	Run in preload mode with fork-based checkpoints for fast execution.
	
	Checkpoint 1: Process with visualizers preloaded, ready to receive code.
	Checkpoint 2: Same code as before, skip transformation using cached code_object.
	"""
	global models_and_events, _source_code, execution_step, line_emit_counter

	emit_meta('preload-mode-start')

	try:
		os.chdir(working_directory)
	except OSError as e:
		_stream_out.write(json.dumps({"type": "error", "error": f"Cannot chdir: {e}"}) + "\n")
		_stream_out.flush()
		sys.exit(1)

	emit_meta('chdir-done')

	visualizers_hash = _preload_visualizers()
	emit_meta('visualizers-loaded')

	# Checkpoint 2 cache
	cached_code_hash: str = ""
	cached_code_object: Any = None

	emit_checkpoint_ready(1, code_hash="", visualizers_hash=visualizers_hash)

	while True:
		try:
			line = sys.stdin.readline()
			if not line:
				break

			line = line.strip()
			if not line:
				continue

			try:
				cmd = json.loads(line)
			except json.JSONDecodeError:
				continue

			if cmd.get('type') != 'run':
				continue

			code = cmd.get('code', '')
			models_and_events_json = cmd.get('models_and_events', '')
			run_id = cmd.get('run_id', '')
			code_hash = compute_code_hash(code)

			emit_meta(f'received-run-{run_id}')

			use_checkpoint2 = (code_hash == cached_code_hash and cached_code_object is not None)

			if use_checkpoint2:
				emit_meta(f'checkpoint2-hit-{run_id}')

			try:
				pid = os.fork()
			except OSError as e:
				emit_fork_result(False, error=str(e))
				continue

			if pid > 0:
				emit_fork_result(True, child_pid=pid)
				if not use_checkpoint2 and code.strip():
					try:
						transformed_ast = transform_code_to_ast(code)
						cached_code_object = compile(transformed_ast, filename='<string>', mode='exec')
						cached_code_hash = code_hash
						emit_checkpoint_ready(2, code_hash=code_hash, visualizers_hash=visualizers_hash)
					except Exception:
						pass
				continue

			# Child process
			_source_code = code
			execution_step = 0
			line_emit_counter = {}

			if use_checkpoint2:
				emit_meta('checkpoint2-child-started')
				_execute_run(cached_code_object, models_and_events_json, run_id)
			else:
				emit_meta('checkpoint1-child-started')

				if not code.strip():
					result = {"stdout": "", "stderr": "", "exitCode": 0}
					_stream_out.write(json.dumps({"type": "end", "result": result, "run_id": run_id}) + "\n")
					_stream_out.flush()
					os._exit(0)

				emit_meta('transform-start')
				try:
					transformed_ast = transform_code_to_ast(code)
				except SyntaxError as e:
					error_line = e.lineno or 1
					log_value(error_line, f"SyntaxError: {e.msg}")
					result = {"stdout": "", "stderr": str(e), "exitCode": 1}
					_stream_out.write(json.dumps({"type": "end", "result": result, "run_id": run_id}) + "\n")
					_stream_out.flush()
					os._exit(0)

				emit_meta('transform-done')
				code_object = compile(transformed_ast, filename='<string>', mode='exec')
				emit_meta('compile-done')
				_execute_run(code_object, models_and_events_json, run_id)

			os._exit(0)

		except Exception as e:
			try:
				_stream_out.write(json.dumps({"type": "error", "error": str(e)}) + "\n")
				_stream_out.flush()
			except Exception:
				pass


if __name__ == "__main__":
	"""
	Main execution block - handles command line usage of the python_runner.

	Modes:
	1. Preload mode: python_runner.py --preload <working_dir>
	2. Direct mode: python_runner.py <working_dir>
	"""

	emit_meta('runner-started')

	if len(sys.argv) < 2:
		print("Error: Working directory required as argument", file=sys.stderr)
		sys.exit(1)

	if sys.argv[1] == '--preload':
		if len(sys.argv) < 3:
			print("Error: --preload requires working directory", file=sys.stderr)
			sys.exit(1)
		run_preload_mode(sys.argv[2])
		sys.exit(0)

	_, working_directory, *_ = sys.argv

	try:
		os.chdir(working_directory)
	except OSError as e:
		print(f"Error: Cannot change to directory '{working_directory}': {e}", file=sys.stderr)
		sys.exit(1)

	emit_meta('chdir-done')
	code = sys.stdin.read()
	emit_meta('code-received')

	result = run_with_visualization(code)
	try:
		_stream_out.write(json.dumps({"type": "end", "result": result}, ensure_ascii=False) + "\n")
		_stream_out.flush()
	except Exception:
		pass
