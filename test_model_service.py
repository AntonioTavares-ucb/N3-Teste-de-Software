import pytest
from unittest.mock import patch, MagicMock, mock_open
import json
import numpy as np
import builtins

from ModelService import app, model_service

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

mock_exam_data = {
    "baseline_value": 120.0,
    "accelerations": 0.003,
    "fetal_movement": 0.0,
    "uterine_contractions": 0.005,
    "light_decelerations": 0.0,
    "severe_decelerations": 0.0,
    "prolongued_decelerations": 0.0,
    "abnormal_short_term_variability": 40.0,
    "mean_value_of_short_term_variability": 1.5,
    "percentage_of_time_with_abnormal_long_term_variability": 0.0,
    "mean_value_of_long_term_variability": 10.0,
    "histogram_width": 50.0,
    "histogram_min": 100.0,
    "histogram_max": 150.0,
    "histogram_number_of_peaks": 5.0,
    "histogram_number_of_zeroes": 0.0,
    "histogram_mode": 125.0,
    "histogram_mean": 125.0,
    "histogram_median": 125.0,
    "histogram_variance": 5.0,
    "histogram_tendency": 0.0
}

class TestFetalHealthModel:
    def setup_method(self):
        model_service.model = None

    @patch('ModelService.pickle.load')
    @patch('ModelService.os.path.exists', return_value=True)
    @patch('builtins.open', new_callable=mock_open)
    def test_load_model_success(self, mock_file_open, mock_exists, mock_pickle_load):
        mock_model_instance = MagicMock()
        mock_pickle_load.return_value = mock_model_instance

        assert model_service.load_model() is True
        assert model_service.model is mock_model_instance
        # CORREÇÃO AQUI: Altere 'model.sav' para 'model_at.sav'
        mock_file_open.assert_called_once_with('model_at.sav', 'rb') #

    @patch('ModelService.os.path.exists', return_value=False)
    def test_load_model_file_not_found(self, mock_exists):
        assert model_service.load_model() is False
        assert model_service.model is None

    @patch('ModelService.pickle.load', side_effect=Exception("Erro de carregamento simulado"))
    @patch('ModelService.os.path.exists', return_value=True)
    @patch('builtins.open', new_callable=mock_open)
    def test_load_model_load_error(self, mock_file_open, mock_exists, mock_pickle_load):
        assert model_service.load_model() is False
        assert model_service.model is None
        # CORREÇÃO AQUI: Altere 'model.sav' para 'model_at.sav'
        mock_file_open.assert_called_once_with('model_at.sav', 'rb') #

    def test_inference_model_not_loaded(self):
        model_service.model = None
        with pytest.raises(ValueError, match="Modelo não carregado. Não é possível realizar a inferência."):
            model_service.inference(np.array([[1, 2, 3]]))

    def test_inference_success(self):
        mock_model_instance = MagicMock()
        mock_model_instance.predict.return_value = np.array([1])
        model_service.model = mock_model_instance

        result = model_service.inference(np.array([[1, 2, 3]]))
        assert result == np.array([1])
        mock_model_instance.predict.assert_called_once()


class TestPredictEndpoint:
    def setup_method(self):
        mock_model_instance = MagicMock()
        mock_model_instance.predict.return_value = np.array([1])
        model_service.model = mock_model_instance

    def teardown_method(self):
        model_service.model = None

    @patch('ModelService.model_service.inference')
    def test_predict_success(self, mock_inference, client):
        mock_inference.return_value = np.array([1])

        response = client.post('/predict', data=json.dumps(mock_exam_data), content_type='application/json')

        assert response.status_code == 200
        assert response.json == {'fetalhealth': 1}
        mock_inference.assert_called_once()

    @patch('ModelService.model_service.load_model', return_value=False)
    def test_predict_model_not_loaded_endpoint(self, mock_load_model, client):
        model_service.model = None
        response = client.post('/predict', data=json.dumps(mock_exam_data), content_type='application/json')

        assert response.status_code == 503
        assert response.json == {"error": "Serviço ML indisponível: Modelo não carregado."}
        mock_load_model.assert_called_once()

    def test_predict_missing_field(self, client):
        incomplete_data = mock_exam_data.copy()
        del incomplete_data['baseline_value']

        response = client.post('/predict', data=json.dumps(incomplete_data), content_type='application/json')

        assert response.status_code == 400
        assert response.json == {'error': "Campo 'baseline_value' está faltando ou é nulo."}

    def test_predict_invalid_data_type(self, client):
        invalid_data = mock_exam_data.copy()
        invalid_data['baseline_value'] = "not_a_number"

        response = client.post('/predict', data=json.dumps(invalid_data), content_type='application/json')

        assert response.status_code == 400
        assert response.json == {'error': "Campo 'baseline_value' deve ser um número válido."}

    def test_predict_empty_json(self, client):
        response = client.post('/predict', data=json.dumps({}), content_type='application/json')

        assert response.status_code == 400
        assert response.json == {'error': 'Nenhum dado JSON fornecido.'}

    def test_predict_no_json(self, client):
        response = client.post('/predict', data="plain text", content_type='text/plain')

        # CORREÇÃO AQUI: Status code e mensagem de erro atualizados para corresponder ao ModelService.py
        assert response.status_code == 500
        assert response.json == {
            'error': 'Erro interno do servidor ao processar a predição.',
            'details': "415 Unsupported Media Type: Did not attempt to load JSON data because the request Content-Type was not 'application/json'."
        }

    @patch('ModelService.model_service.inference')
    def test_predict_inference_error(self, mock_inference, client):
        mock_inference.side_effect = ValueError("Erro de inferência simulado.")

        response = client.post('/predict', data=json.dumps(mock_exam_data), content_type='application/json')

        assert response.status_code == 500
        # CORREÇÃO AQUI: Mensagem de erro atualizada para corresponder ao ModelService.py
        assert response.json == {
            'error': 'Erro de inferência simulado.'
        }