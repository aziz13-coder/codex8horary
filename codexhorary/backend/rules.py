from typing import List, Dict, Optional

def dynamic_weight() -> float:
    """Example weight function used by some rules.

    In real usage this could compute a weight based on
    external configuration or runtime context. For the
    test suite we simply return a deterministic value.
    """
    return 2.5


# Rules use a common schema where each rule must provide either a
# numeric ``weight`` or a callable name via ``weight_fn``.
#
# The schema is intentionally simple to keep the rule system flexible
# while allowing unit tests to validate the structure.
RULES: List[Dict[str, Optional[str]]] = [
    {
        "id": "static",
        "description": "Rule with an inline numeric weight",
        "weight": 1.0,
    },
    {
        "id": "dynamic",
        "description": "Rule that resolves its weight via a named function",
        "weight_fn": "dynamic_weight",
    },
]
