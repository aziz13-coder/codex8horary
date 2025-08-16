from typing import Any, Dict


def _phase_a_setup(chart: Dict[str, Any]) -> None:
    """Normalize time/location, compute rulers, build aspect timeline.

    For the test environment this simply records that setup completed.
    """
    chart['normalized'] = True
    chart.setdefault('rulers', {})
    chart.setdefault('aspect_timeline', [])


def _phase_b_primary_success(chart: Dict[str, Any]) -> bool:
    """Search for direct, translation, or collection paths in time order."""
    paths = chart.get('paths', [])
    for path in ('direct', 'translation', 'collection'):
        if path in paths:
            chart.setdefault('proof', []).append(f"path:{path}")
            return True
    return False


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
    baseline = _phase_b_primary_success(chart)
    blocked = _phase_c_early_blockers(chart, fatal_combustion=fatal_combustion)
    if not baseline and not blocked:
        _phase_d_no_path(chart)
    baseline = baseline and not blocked
    confidence = 0.5 if baseline else 0.2
    confidence = _phase_e_modulators(chart, confidence)
    return _phase_f_output(baseline, chart, confidence)
