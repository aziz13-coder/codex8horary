from typing import Any, Dict, Tuple

# Weights applied for different primary perfection paths. These constants make
# path priority explicit and allow indirect paths to influence confidence
# without guaranteeing success on their own.
WEIGHT_DIRECT = 0.3
WEIGHT_TRANSLATION = 0.2
WEIGHT_COLLECTION = 0.1


def _phase_a_setup(chart: Dict[str, Any]) -> None:
    """Normalize time/location, compute rulers, build aspect timeline.

    For the test environment this simply records that setup completed.
    """
    chart['normalized'] = True
    chart.setdefault('rulers', {})
    chart.setdefault('aspect_timeline', [])


def _phase_b_primary_success(chart: Dict[str, Any]) -> Tuple[bool, float, bool]:
    """Validate primary perfection paths and compute path weights.

    The chart may provide an ``aspect_timeline`` describing potential
    connections between significators. Each item in the timeline should
    contain the path type (``direct``, ``translation`` or ``collection``)
    and a ``status`` field indicating whether the aspect is ``applying``,
    ``separating`` or already ``perfected``.

    Only paths with applying aspects contribute to the judgment. ``direct``
    paths establish the baseline success. ``translation`` and ``collection``
    paths add to the confidence score and can establish an indirect baseline
    if no direct path exists. Separating or perfected paths are recorded in
    ``rejected_paths`` for later debugging.

    Returns
    -------
    Tuple[bool, float, bool]
        ``baseline`` indicates if a direct path was found. ``bonus`` is the
        accumulated weight from any applying paths. ``indirect_baseline`` is
        ``True`` when at least one applying translation or collection path
        exists without a direct path.
    """

    timeline = chart.get('aspect_timeline', [])
    valid: list[str] = []
    rejected: list[str] = []
    baseline = False
    bonus = 0.0
    indirect_candidate = False

    for event in timeline:
        path_type = event.get('path') or event.get('type')
        status = event.get('status')
        if path_type in ('direct', 'translation', 'collection'):
            if status == 'applying':
                valid.append(path_type)
                if path_type == 'direct':
                    baseline = True
                    bonus += WEIGHT_DIRECT
                elif path_type == 'translation':
                    bonus += WEIGHT_TRANSLATION
                    indirect_candidate = True
                elif path_type == 'collection':
                    bonus += WEIGHT_COLLECTION
                    indirect_candidate = True
            elif status in {'separating', 'perfected'}:
                rejected.append(path_type)

    chart['paths'] = valid
    if rejected:
        chart['rejected_paths'] = rejected

    for path in valid:
        chart.setdefault('proof', []).append(f"path:{path}")

    indirect_baseline = not baseline and indirect_candidate
    return baseline, bonus, indirect_baseline


def _phase_c_early_blockers(chart: Dict[str, Any], *, fatal_combustion: bool) -> bool:
    """Check for early blockers such as prohibition or refranation."""
    blockers = chart.get('blockers', [])
    for blocker in ('prohibition', 'refranation', 'combustion'):
        if blocker in blockers:
            if blocker != 'combustion' or fatal_combustion:
                chart.setdefault('proof', []).append(f"blocker:{blocker}")
                return True
    return False


def _phase_d_no_path(chart: Dict[str, Any]) -> None:
    """Record that no path was found."""
    chart.setdefault('proof', []).append('no-path')


def _phase_e_modulators(chart: Dict[str, Any], confidence: float) -> float:
    """Apply modifiers like dignities, receptions, benefics, retrograde."""
    mods = chart.get('modulators', {})
    confidence += mods.get('dignities', 0.0)
    confidence += mods.get('receptions', 0.0)
    confidence += mods.get('benefics', 0.0)
    if chart.get('retrograde'):
        confidence -= 1.0
    return max(0.0, min(1.0, confidence))


def _phase_f_output(baseline_yes: bool, chart: Dict[str, Any], confidence: float) -> Dict[str, Any]:
    """Create the final verdict, confidence and proof list."""
    verdict = 'YES' if baseline_yes else 'NO'
    return {
        'verdict': verdict,
        'confidence': round(confidence, 2),
        'proof': chart.get('proof', []),
    }


def evaluate_chart(chart: Dict[str, Any], *, fatal_combustion: bool = True) -> Dict[str, Any]:
    """Coordinate all evaluation phases and return the final verdict.

    Parameters
    ----------
    chart: Dict[str, Any]
        Mutable chart representation. The function mutates it with
        intermediate information while composing the phases.
    fatal_combustion: bool
        If ``True`` combustion acts as a fatal blocker.
    """
    _phase_a_setup(chart)
    baseline, bonus, indirect_baseline = _phase_b_primary_success(chart)
    blocked = _phase_c_early_blockers(chart, fatal_combustion=fatal_combustion)
    if not baseline and not indirect_baseline and not blocked:
        _phase_d_no_path(chart)
    baseline_yes = (baseline or indirect_baseline) and not blocked
    confidence = 0.5 if baseline_yes else 0.2
    confidence += bonus
    confidence = _phase_e_modulators(chart, confidence)
    return _phase_f_output(baseline_yes, chart, confidence)
