export { openDb, migrate, closeDb, generateId } from './db.js';
export type { DbConfig } from './db.js';

export { safeParseJson } from './utils/json.js';

export { loadConfig, getDefaultConfigPath, getDefaultDataDir } from './config.js';
export type { PmAgentConfig } from './config.js';

export { createDecision, getDecision, listDecisions, linkEntityToDecision } from './memory/decisions.js';
export type { Decision } from './memory/decisions.js';

export { createBlocker, getBlocker, resolveBlocker, getActiveBlockers, getBlockers } from './memory/blockers.js';
export type { Blocker } from './memory/blockers.js';

export { createNote, getNote, searchNotes, getNotesByTag } from './memory/notes.js';
export type { Note } from './memory/notes.js';

export { createTask, getTask, updateTaskStatus, getBlockedTasks, listTasks } from './memory/tasks.js';
export type { Task, TaskStatus } from './memory/tasks.js';

export { captureScope, getLatestScope, getScopeHistory } from './memory/scope.js';
export type { ScopeSnapshot } from './memory/scope.js';

export { getRelatedEntities, expandGraph, getStandupData } from './graph.js';
export type { RelatedEntities } from './graph.js';

// Rules engine exports
export type { Rule, RuleResult, EnforcementResult, ParsedAction, Scope, Severity, ActionType } from './rules/types.js';
export { loadRules, enforce, evaluateRule, parseAction, addRule, removeRule, toggleRule } from './rules/engine.js';
export { tokenize, parse, evaluate, interpolate } from './rules/expression.js';
export type { Token, TokenType, ASTNode } from './rules/expression.js';

// Scanner exports
export { scan, scanIncremental, verify } from './scanner/index.js';
export type { ScanResult, ScanOptions } from './scanner/index.js';
export { walkProject, classifyFile, hashFile, parseGitignore } from './scanner/file-registry.js';
export type { FileEntry, FileType } from './scanner/file-registry.js';
export { findImports, findCircularDependencies, storeDependencyEdges, resolveImport, getTransitiveDependencies } from './scanner/dependency-mapper.js';
export type { DependencyEdge } from './scanner/dependency-mapper.js';
export { detectEntryPoints, detectFramework, detectRole, storeArchitecture } from './scanner/architecture-detector.js';
export type { ArchitectureEntry, ArchitectureRole } from './scanner/architecture-detector.js';
export { startWatcher, stopWatcher } from './scanner/change-watcher.js';
export { analyzeImpact } from './scanner/impact-analyzer.js';
export type { ImpactReport } from './scanner/impact-analyzer.js';

// Integration exports
export { GitHubIntegration } from './integrations/github.js';
export { LinearIntegration } from './integrations/linear.js';
export { detectIntegrations, syncAllIntegrations } from './integrations/index.js';
export type { SyncResult } from './integrations/index.js';
export type { Integration } from './integrations/types.js';
export { IntegrationError, withRetry } from './integrations/types.js';

// Database retry utilities
export { withWriteRetry, withWriteRetryAsync } from './database/retry.js';
export type { RetryOptions } from './database/retry.js';

// Shipped defaults
export { DEFAULT_CONFIG_TOML, DEFAULT_RULES_TOML } from './defaults.js';
