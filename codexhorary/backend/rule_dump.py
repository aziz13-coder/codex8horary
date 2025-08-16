from typing import Any, Dict, List

import rules


def _resolve_weight(rule: Dict[str, Any]) -> float:
    """Resolve the weight for a rule."""
    if isinstance(rule.get("weight"), (int, float)):
        return float(rule["weight"])

    fn_name = rule.get("weight_fn")
    if fn_name:
        fn = getattr(rules, fn_name, None)
        if callable(fn):
            return float(fn())
        raise ValueError(f"Weight function '{fn_name}' not found")

    raise ValueError(f"Rule '{rule.get('id')}' lacks a weight or weight_fn")


def dump_rules() -> List[Dict[str, Any]]:
    """Return a list of rules with resolved numeric weights."""
    dumped: List[Dict[str, Any]] = []
    for rule in rules.RULES:
        weight = _resolve_weight(rule)
        dumped.append({**{k: v for k, v in rule.items() if k != "weight_fn"}, "weight": weight})
    return dumped


def apply_rule(rule_id: str, value: float) -> float:
    """Apply a rule's weight to a value."""
    for rule in dump_rules():
        if rule.get("id") == rule_id:
            return value * rule["weight"]
    raise KeyError(f"Unknown rule id: {rule_id}")
