import pytest
from evaluate_chart import _phase_b_primary_success, evaluate_chart


def test_primary_success_filters_non_applying_paths():
    chart = {
        'aspect_timeline': [
            {'type': 'direct', 'status': 'separating'},
            {'type': 'translation', 'status': 'applying'},
            {'type': 'collection', 'status': 'perfected'},
        ]
    }

    baseline = _phase_b_primary_success(chart)
    assert baseline is True
    assert chart['paths'] == ['translation']
    assert chart['rejected_paths'] == ['direct', 'collection']
    assert 'path:translation' in chart['proof']


def test_evaluate_chart_rejects_only_perfected_paths():
    chart = {
        'aspect_timeline': [
            {'type': 'direct', 'status': 'perfected'}
        ]
    }

    result = evaluate_chart(chart)
    # No applying paths, so verdict should be NO
    assert result['verdict'] == 'NO'
    assert chart['paths'] == []
    assert chart['rejected_paths'] == ['direct']
    assert 'no-path' in result['proof']
