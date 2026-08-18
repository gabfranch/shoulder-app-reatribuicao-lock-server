const express = require('express');
const cors = require('cors');
const app = express();

// Libera CORS para as origens da Zendesk (produção) e do ambiente de
// testes local do ZAT (localhost:4567). Ajuste/adicione origens conforme
// necessário.
app.use(cors({
    origin: [
        /\.zendesk\.com$/,
        /\.zdusercontent\.com$/,
        'http://localhost:4567'
    ],
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-lock-secret']
}));

app.use(express.json());

// Chave simples pra evitar que qualquer um chame o endpoint publicamente.
// Configure a mesma chave nas duas pontas (aqui e no app da Zendesk).
const SHARED_SECRET = process.env.LOCK_SECRET;

// Janela mínima entre execuções aceitas (em ms). Ajuste conforme a
// frequência real que você quer permitir (ex: 60000 = 1 execução por minuto).
const LOCK_WINDOW_MS = parseInt(process.env.LOCK_WINDOW_MS || '60000', 10);

// Estado em memória. Simples e suficiente pra esse caso de uso, já que
// o Node processa requisições de forma sequencial (não há race condition
// entre o "check" e o "set" abaixo, contanto que não haja "await" no meio).
let lastRun = 0;

app.post('/acquire-lock', (req, res) => {
    const secret = req.headers['x-lock-secret'];

    if (!SHARED_SECRET || secret !== SHARED_SECRET) {
        return res.status(401).json({ granted: false, error: 'unauthorized' });
    }

    const now = Date.now();

    // Ponto crítico: verificação e atualização acontecem de forma síncrona,
    // sem nenhum "await" entre elas, então não há espaço pra duas chamadas
    // concorrentes obterem o lock na mesma janela.
    if (now - lastRun >= LOCK_WINDOW_MS) {
        lastRun = now;
        console.log(`Lock concedido em ${new Date(now).toISOString()}`);
        return res.json({ granted: true, timestamp: now });
    }

    return res.json({ granted: false, timestamp: lastRun });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', lastRun });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Lock server rodando na porta ${PORT}`);
});
