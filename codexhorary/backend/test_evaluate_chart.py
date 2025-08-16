import pytest
from evaluate_chart import (
    WEIGHT_TRANSLATION,
    _phase_b_primary_success,
    evaluate_chart,
)


def test_primary_success_filters_non_applying_paths():
    chart = {
        'aspect_timeline': [
            {'type': 'direct', 'status': 'separating'},
            {'type': 'translation', 'status': 'applying'},
            {'type': 'collection', 'status': 'perfected'},
        ]
    }

    baseline, bonus = _phase_b_primary_success(chart)
    assert baseline is False
    assert bonus == WEIGHT_TRANSLATION
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


def test_translation_path_only_modifies_confidence():
    chart = {
        'aspect_timeline': [
            {'type': 'translation', 'status': 'applying'}
        ]
    }

    result = evaluate_chart(chart)
    assert result['verdict'] == 'NO'
    assert result['confidence'] == pytest.approx(0.2 + WEIGHT_TRANSLATION)
    assert 'path:translation' in result['proof']
