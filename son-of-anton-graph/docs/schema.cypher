// Son of Anton — FalkorDB Code Graph Schema
// This file documents the graph schema used by the code intelligence pipeline.
// All indexing services (Tree-sitter indexer, LSIF/SCIP pipeline) write to this schema.

// ============================================================================
// NODE TYPES
// ============================================================================

// File node — represents a source file in the project
// CREATE (:File {
//   path: '/src/auth/middleware.ts',   -- project-relative file path
//   language: 'typescript',            -- programming language
//   lastModified: timestamp(),         -- last modification time (epoch ms)
//   hash: 'sha256...',                 -- content hash for change detection
//   lineCount: 120                     -- total lines in file
// })

// Function node — represents a function or method
// CREATE (:Function {
//   name: 'validateToken',             -- function name
//   qualifiedName: 'AuthService.validateToken', -- fully qualified name (class.method)
//   file: '/src/auth/middleware.ts',    -- containing file path
//   startLine: 42,                     -- start line number
//   endLine: 78,                       -- end line number
//   async: true,                       -- whether the function is async
//   exported: true,                    -- whether the function is exported
//   signature: '(token: string) => Promise<User>', -- type signature
//   isMethod: false,                   -- whether it's a class method
//   isStatic: false,                   -- whether it's a static method
//   isConstructor: false,              -- whether it's a constructor
//   contentHash: 'sha256...'           -- hash of the function body for change detection
// })

// Class node — represents a class definition
// CREATE (:Class {
//   name: 'AuthService',               -- class name
//   file: '/src/auth/service.ts',      -- containing file path
//   startLine: 10,                     -- start line number
//   endLine: 150,                      -- end line number
//   abstract: false,                   -- whether the class is abstract
//   exported: true,                    -- whether the class is exported
//   contentHash: 'sha256...'           -- hash of class body for change detection
// })

// Type node — represents an interface, type alias, or enum
// CREATE (:Type {
//   name: 'User',                      -- type name
//   kind: 'interface',                 -- 'interface' | 'type' | 'enum'
//   file: '/src/types/user.ts',        -- containing file path
//   startLine: 1,                      -- start line number
//   endLine: 12,                       -- end line number
//   exported: true,                    -- whether the type is exported
//   contentHash: 'sha256...'           -- hash of type body for change detection
// })

// Module node — represents a logical module or namespace
// CREATE (:Module {
//   name: 'auth',                      -- module name
//   path: '/src/auth/',                -- directory path
//   entryPoint: '/src/auth/index.ts'   -- main entry point file
// })

// Import node — represents an import statement
// CREATE (:Import {
//   source: '@/auth/service',          -- import source path or package
//   specifiers: 'AuthService, validateToken', -- imported names
//   file: '/src/routes/api.ts',        -- file containing the import
//   line: 3,                           -- line number
//   isDefault: false,                  -- whether it's a default import
//   isNamespace: false                 -- whether it's a namespace import (import * as ...)
// })


// ============================================================================
// EDGE TYPES (RELATIONSHIPS)
// ============================================================================

// CALLS — function calls another function
// Source: Tree-sitter (structural), LSIF/SCIP (precise cross-file)
// CREATE (a:Function)-[:CALLS {line: 55, column: 10}]->(b:Function)

// IMPORTS — file imports from another file
// Source: Tree-sitter
// CREATE (a:File)-[:IMPORTS {specifiers: 'AuthService', line: 3}]->(b:File)

// EXTENDS — class extends another class
// Source: Tree-sitter, LSIF/SCIP
// CREATE (a:Class)-[:EXTENDS]->(b:Class)

// IMPLEMENTS — class implements an interface
// Source: Tree-sitter, LSIF/SCIP
// CREATE (a:Class)-[:IMPLEMENTS]->(b:Type)

// CONTAINS — file contains a symbol (function, class, type)
// Source: Tree-sitter
// CREATE (a:File)-[:CONTAINS]->(b:Function)
// CREATE (a:File)-[:CONTAINS]->(b:Class)
// CREATE (a:File)-[:CONTAINS]->(b:Type)

// EXPORTS — file exports a symbol
// Source: Tree-sitter
// CREATE (a:File)-[:EXPORTS]->(b:Function)
// CREATE (a:File)-[:EXPORTS]->(b:Class)
// CREATE (a:File)-[:EXPORTS]->(b:Type)

// RETURNS — function returns a type
// Source: Tree-sitter
// CREATE (a:Function)-[:RETURNS]->(b:Type)

// ACCEPTS — function accepts a parameter of a type
// Source: Tree-sitter
// CREATE (a:Function)-[:ACCEPTS {paramName: 'token', position: 0}]->(b:Type)

// HAS_METHOD — class has a method
// Source: Tree-sitter
// CREATE (a:Class)-[:HAS_METHOD]->(b:Function)

// HAS_PROPERTY — class or type has a property
// Source: Tree-sitter
// CREATE (a:Class)-[:HAS_PROPERTY {name: 'logger', type: 'Logger', visibility: 'private'}]->(b:Type)

// REFERENCES — any symbol references another (precise, from LSIF/SCIP)
// Source: LSIF/SCIP only
// CREATE (a:Function)-[:REFERENCES {line: 60, column: 12, kind: 'read'}]->(b:Function)

// BELONGS_TO — file or symbol belongs to a module
// Source: Tree-sitter (directory-based grouping)
// CREATE (a:File)-[:BELONGS_TO]->(b:Module)


// ============================================================================
// INDICES
// ============================================================================

// Primary lookup indices — most common query patterns
CREATE INDEX ON :File(path)
CREATE INDEX ON :Function(name)
CREATE INDEX ON :Function(qualifiedName)
CREATE INDEX ON :Class(name)
CREATE INDEX ON :Type(name)
CREATE INDEX ON :Module(name)
CREATE INDEX ON :Import(source)

// Secondary indices — used for scoped queries
CREATE INDEX ON :Function(file)
CREATE INDEX ON :Class(file)
CREATE INDEX ON :Type(file)
CREATE INDEX ON :Import(file)


// ============================================================================
// SAMPLE QUERIES — Validate schema correctness
// ============================================================================

// Q1: What does this function call?
// MATCH (f:Function {name: 'validateToken'})-[:CALLS]->(called:Function)
// RETURN called.name, called.file

// Q2: What calls this function? (impact analysis)
// MATCH (caller:Function)-[:CALLS]->(f:Function {name: 'validateToken'})
// RETURN caller.name, caller.file

// Q3: What's the blast radius of changing this file?
// MATCH (f:File {path: '/src/auth/service.ts'})<-[:IMPORTS*1..3]-(dependent:File)
// RETURN dependent.path

// Q4: What does this file export?
// MATCH (f:File {path: '/src/auth/index.ts'})-[:EXPORTS]->(sym)
// RETURN labels(sym)[0] AS type, sym.name

// Q5: Give me a structural summary of this module
// MATCH (m:Module {name: 'auth'})<-[:BELONGS_TO]-(f:File)-[:CONTAINS]->(sym)
// RETURN f.path, labels(sym)[0] AS type, sym.name, sym.exported

// Q6: Find all implementations of an interface
// MATCH (cls:Class)-[:IMPLEMENTS]->(iface:Type {name: 'IAuthProvider'})
// RETURN cls.name, cls.file

// Q7: Get the full call graph for a function (2 levels deep)
// MATCH path = (f:Function {name: 'handleRequest'})-[:CALLS*1..2]->(called:Function)
// RETURN path

// Q8: Find unused exports (exported but never referenced)
// MATCH (f:File)-[:EXPORTS]->(sym)
// WHERE NOT exists((sym)<-[:REFERENCES]-())
//   AND NOT exists((sym)<-[:CALLS]-())
// RETURN labels(sym)[0] AS type, sym.name, f.path

// Q9: Find circular dependencies between files
// MATCH path = (a:File)-[:IMPORTS*2..5]->(a)
// RETURN [n IN nodes(path) | n.path] AS cycle

// Q10: Get function signature with parameter types
// MATCH (f:Function {name: 'createUser'})-[:ACCEPTS]->(paramType:Type)
// RETURN f.signature, paramType.name
// ORDER BY f.name
