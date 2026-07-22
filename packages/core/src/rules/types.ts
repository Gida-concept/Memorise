export type Scope = 'pm' | 'code' | 'all';
export type Severity = 'hard' | 'soft' | 'info';
export type ActionType = 'block' | 'confirm' | 'notify' | 'suggest';

export interface Rule {
  name: string;
  scope: Scope;
  trigger: string;
  condition?: string;
  action: string; // Format: "action_type: 'message with {interpolation}'"
  severity: Severity;
  description?: string;
  enabled?: boolean;
}

export interface RuleResult {
  rule: string;
  severity: Severity;
  action: ActionType;
  message: string;
  triggered: boolean;
  passed: boolean; // true = rule did NOT block (no violation)
}

export interface EnforcementResult {
  status: 'completed' | 'rejected' | 'pending_confirmation';
  results: RuleResult[];
  rules_evaluated: number;
  rules_triggered: number;
  rules_blocked: number;
  blocked: boolean;
  confirmation_required: boolean;
}

export interface ParsedAction {
  type: ActionType;
  message: string; // May contain {templates} to interpolate
}
