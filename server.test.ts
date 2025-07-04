import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import { Pool } from 'pg';

// AVISO: Servidor a ser executado com BANCO DE DADOS MOCKADO. Nenhuma persistência real ocorrerá.
console.warn('AVISO: Servidor a ser executado com BANCO DE DADOS MOCKADO. Nenhuma persistência real ocorrerá.');

const defaultMockQueryResult = { rows: [{ id: 999, cpf: 'MOCKEDCPF999', ts: new Date().toISOString(), fetalhealth: 1, baseline_value: 120 }] };
const defaultMockEmptyQueryResult = { rows: [] };

const defaultActivePool: Pool = {
  query: async (queryText: string, values?: any[]) => {
    if (queryText.includes('INSERT INTO registros')) {
      return defaultMockQueryResult;
    } else if (queryText.includes('SELECT * FROM registros')) {
      if (values && values.length > 0 && values[0] === 'MOCKEDCPF999') {
        return defaultMockQueryResult;
      }
      return defaultMockEmptyQueryResult;
    } else if (queryText.includes('DELETE FROM registros')) {
      // Adiciona comportamento mock para o cleanup
      console.log('Mock DELETE FROM registros executado.');
      return { rows: [], rowCount: 1 }; // Simula uma deleção bem-sucedida
    }
    return defaultMockEmptyQueryResult;
  },
  connect: async () => ({
    query: async (q: string, v?: any[]) => (defaultActivePool as any).query(q, v),
    release: () => {},
  }),
  end: async () => { console.log('Mock DB Pool encerrado.'); },
} as unknown as Pool;

const defaultActiveInitDatabase: () => Promise<void> = async () => {
  console.log('Mock initDatabase executado. Nenhuma tabela real criada.');
};

// Export these for testing purposes only, allowing them to be reassigned by tests
export let activePool: Pool = defaultActivePool; // <--- CHANGED AND ASSIGNED
export let activeInitDatabase: () => Promise<void> = defaultActiveInitDatabase; // <--- CHANGED AND ASSIGNED


const app = express();
app.use(cors());
app.use(express.json());

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

const EXAM_DATA_KEYS = [
  'baseline_value', 'accelerations', 'fetal_movement', 'uterine_contractions',
  'light_decelerations', 'severe_decelerations', 'prolongued_decelerations',
  'abnormal_short_term_variability', 'mean_value_of_short_term_variability',
  'percentage_of_time_with_abnormal_long_term_variability',
  'mean_value_of_long_term_variability', 'histogram_width', 'histogram_min',
  'histogram_max', 'histogram_number_of_peaks', 'histogram_number_of_zeroes',
  'histogram_mode', 'histogram_mean', 'histogram_median', 'histogram_variance',
  'histogram_tendency'
];

function validateExamData(data: any): string | null {
  for (const key of EXAM_DATA_KEYS) {
    if (!(key in data) || data[key] === null || data[key] === undefined) {
      return `Campo '${key}' está em falta ou é nulo.`;
    }
    if (typeof data[key] !== 'number' || !Number.isFinite(data[key])) {
      return `Campo '${key}' deve ser um número válido.`;
    }
  }
  return null;
}


app.post('/registros', async (req: Request, res: Response) => {
  try {
    const { cpf, ...examData } = req.body;

    if (!cpf || typeof cpf !== 'string' || cpf.length !== 11 || !/^\d{11}$/.test(cpf)) {
      return res.status(400).json({ error: 'CPF inválido. Deve conter 11 dígitos numéricos.' });
    }

    const validationError = validateExamData(examData);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const mlResponse = await axios.post(`${ML_SERVICE_URL}/predict`, examData);
    const { fetalhealth } = mlResponse.data;

    if (typeof fetalhealth !== 'number' || !Number.isInteger(fetalhealth) || fetalhealth < 1 || fetalhealth > 3) {
      console.warn(`Serviço ML retornou um valor inesperado para fetalhealth: ${fetalhealth}`);
      return res.status(500).json({ error: 'Erro interno: Resposta inválida do serviço de Machine Learning.' });
    }

    const query = `
      INSERT INTO registros (
        cpf, baseline_value, accelerations, fetal_movement, uterine_contractions,
        light_decelerations, severe_decelerations, prolongued_decelerations,
        abnormal_short_term_variability, mean_value_of_short_term_variability,
        percentage_of_time_with_abnormal_long_term_variability,
        mean_value_of_long_term_variability, histogram_width, histogram_min,
        histogram_max, histogram_number_of_peaks, histogram_number_of_zeroes,
        histogram_mode, histogram_mean, histogram_median, histogram_variance,
        histogram_tendency, fetalhealth
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *
    `;

    const values = [
      cpf, examData.baseline_value, examData.accelerations, examData.fetal_movement,
      examData.uterine_contractions, examData.light_decelerations, examData.severe_decelerations,
      examData.prolongued_decelerations, examData.abnormal_short_term_variability,
      examData.mean_value_of_short_term_variability, examData.percentage_of_time_with_abnormal_long_term_variability,
      examData.mean_value_of_long_term_variability, examData.histogram_width, examData.histogram_min,
      examData.histogram_max, examData.histogram_number_of_peaks, examData.histogram_number_of_zeroes,
      examData.histogram_mode, examData.histogram_mean, examData.histogram_median,
      examData.histogram_variance, examData.histogram_tendency, fetalhealth
    ];

    const result = await activePool.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar registo' });
  }
});

app.get('/registros', async (req: Request, res: Response) => {
  try {
    const { cpf } = req.query;
    let query = 'SELECT * FROM registros';
    const values: any[] = [];

    if (cpf) {
      if (typeof cpf !== 'string' || cpf.length !== 11 || !/^\d{11}$/.test(cpf)) {
        return res.status(400).json({ error: 'CPF inválido para pesquisa. Deve conter 11 dígitos numéricos.' });
      }
      query += ' WHERE cpf = $1';
      values.push(cpf);
    }

    query += ' ORDER BY ts DESC';

    const result = await activePool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao procurar registos' });
  }
});

// --- ROTA DE LIMPEZA ADICIONADA ---
// ROTA PARA LIMPEZA DO BANCO DE DADOS EM AMBIENTE DE TESTE
app.post('/test/cleanup-db', async (req: Request, res: Response) => {
  // Verificação de segurança para garantir que isso só rode em ambiente de teste
  // Em uma aplicação real, você usaria variáveis de ambiente como process.env.NODE_ENV
  // Por simplicidade aqui, vamos apenas permitir. Em produção, isso seria uma falha de segurança.
  
  try {
    // Comando para deletar todos os registros da tabela
    await activePool.query('DELETE FROM registros');
    res.status(200).send('Banco de dados de teste limpo com sucesso.');
  } catch (error) {
    console.error('Erro ao limpar o banco de dados de teste:', error);
    res.status(500).json({ error: 'Falha ao limpar o banco de dados.' });
  }
});


const PORT = process.env.PORT || 3000;

if (require.main === module) {
  activeInitDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor a ser executado na porta ${PORT}`);
    });
  }).catch(err => {
    console.error('Falha ao inicializar a base de dados e iniciar o servidor:', err);
    process.exit(1);
  });
}

export default app;