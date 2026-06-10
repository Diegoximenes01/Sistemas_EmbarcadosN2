const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Configuração de dados em memória
let readingsHistory = [];
const MAX_READINGS = 100;

// Configurações padrão de alerta (podem ser alteradas pelo Mobile/Dashboard)
let alertConfig = {
  email: process.env.ALERT_EMAIL || 'diegoximenes2005@gmail.com',
  phone: process.env.ALERT_PHONE || '+5581988247885',
  threshold: 55 // Limite do sensor para disparo de alertas na plataforma
};

// Histórico de Alertas Disparados
let alertsHistory = [];

// Variável para evitar múltiplos disparos seguidos do mesmo alerta de e-mail/SMS
let ultimoEstadoAlerta = false;

// Configuração do Transportador de E-mail (Nodemailer)
let mailTransporter = null;
let etherealUrl = null;

// Inicializa a conta de e-mail de teste (Ethereal) se não houver configurações no .env
async function initEmail() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log('📬 Configurando SMTP real fornecido no .env...');
    mailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT == '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    console.log('📬 SMTP não configurado. Gerando conta de teste SMTP Ethereal...');
    try {
      let testAccount = await nodemailer.createTestAccount();
      mailTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log(`✅ Conta de e-mail de teste criada com sucesso!`);
      console.log(`   Usuário: ${testAccount.user}`);
      console.log(`   (Todos os e-mails enviados poderão ser visualizados no painel Ethereal)`);
    } catch (err) {
      console.error('❌ Falha ao criar conta de teste Ethereal:', err);
    }
  }
}
// initEmail();

// Middlewares
app.use(express.json());

// Habilita CORS para permitir que scripts externos (como no Tinkercad) enviem dados de leitura
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Redireciona a antiga rota '/mobile' para a raiz '/'
app.get('/mobile', (req, res) => {
  res.redirect('/');
});

// ==========================================
// Rotas da API HTTP
// ==========================================

// Retorna o histórico de leituras
app.get('/api/readings', (req, res) => {
  res.json({
    history: readingsHistory,
    config: alertConfig,
    alerts: alertsHistory
  });
});

// Atualiza configurações de contato de alertas
app.post('/api/config', (req, res) => {
  const { email, phone, threshold } = req.body;
  if (email) alertConfig.email = email;
  if (phone) alertConfig.phone = phone;
  if (threshold !== undefined) alertConfig.threshold = parseInt(threshold);

  // Avisa todos os clientes sobre a mudança de configuração
  io.emit('configUpdated', alertConfig);

  res.json({ success: true, message: 'Configurações atualizadas', config: alertConfig });
});

// Endpoint que o dispositivo IoT (ESP32/Ponte Serial) consome para enviar dados
// Função auxiliar para processar e distribuir uma nova leitura do sensor (usada pelo POST local e pelo Polling da TagoIO)
function processarLeitura(smoke, alertaAtivo, timestamp = new Date().toISOString()) {
  smoke = parseInt(smoke);
  alertaAtivo = alertaAtivo === true || alertaAtivo === 'true' || alertaAtivo === 1 || alertaAtivo === '1' || smoke >= alertConfig.threshold;

  const newReading = { timestamp, smoke, alertaAtivo };

  // Adiciona ao histórico e remove se passar do máximo
  readingsHistory.push(newReading);
  if (readingsHistory.length > MAX_READINGS) {
    readingsHistory.shift();
  }

  // Envia a leitura em tempo real para todos os clientes conectados
  io.emit('newReading', newReading);

  // Verifica transição de estado seguro -> alerta para disparar notificações
  if (alertaAtivo && !ultimoEstadoAlerta) {
    ultimoEstadoAlerta = true;
    const alertMessage = `⚠️ [ALERTA DE INCÊNDIO - ARCANJOS] Fumaça detectada! Nível: ${smoke}. Verifique o local imediatamente.`;
    
    console.log(`\n🚨 ALERTA ATIVADO - Nível de Fumaça: ${smoke} 🚨`);
    
    // Adiciona ao histórico de alertas disparados
    const newAlertEvent = { timestamp, smoke, type: 'INCÊNDIO', message: alertMessage };
    alertsHistory.push(newAlertEvent);
    io.emit('systemAlert', newAlertEvent);

    // 1. Dispara E-mail
    // enviarEmailAlerta(smoke, timestamp);

    // 2. Dispara SMS (Real ou Simulado)
    // enviarSMSAlerta(smoke);

  } else if (!alertaAtivo && ultimoEstadoAlerta) {
    // Normalizou
    ultimoEstadoAlerta = false;
    const infoMessage = `🟢 [SISTEMA ARCANJOS] O ambiente retornou ao estado seguro. Nível de fumaça: ${smoke}.`;
    console.log(`\n🟢 AMBIENTE NORMALIZADO - Nível de Fumaça: ${smoke} 🟢`);
    
    const recoveryEvent = { timestamp, smoke, type: 'NORMALIZADO', message: infoMessage };
    alertsHistory.push(recoveryEvent);
    io.emit('systemAlert', recoveryEvent);

    // enviarEmailRecuperacao(smoke, timestamp);
    // enviarSMSRecuperacao(smoke);
  }
}

// Endpoint que o dispositivo IoT (ESP32/Ponte Serial) consome para enviar dados
app.post('/api/device/data', async (req, res) => {
  let { smoke, alertaAtivo } = req.body;

  if (smoke === undefined) {
    return res.status(400).json({ error: 'Dados inválidos. Campo "smoke" é obrigatório.' });
  }

  smoke = parseInt(smoke);
  alertaAtivo = alertaAtivo === true || alertaAtivo === 'true' || smoke >= alertConfig.threshold;

  // Processa localmente e atualiza os dashboards conectados via websocket
  processarLeitura(smoke, alertaAtivo);

  // Encaminha a leitura de dados para a TagoIO na nuvem automaticamente em segundo plano
  const tagoToken = "1590acd8-26a1-41b8-a5cb-da6f022c5872";
  const tagoPayload = [
    { "variable": "smoke", "value": smoke },
    { "variable": "alertaAtivo", "value": alertaAtivo ? 1 : 0 }
  ];

  fetch("https://api.tago.io/data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": tagoToken
    },
    body: JSON.stringify(tagoPayload)
  })
  .then(response => {
    if (response.ok) {
      console.log(`📡 [TAGOIO Cloud] Dados sincronizados via HTTP POST: Fumaça: ${smoke} PPM | Alerta: ${alertaAtivo}`);
    } else {
      console.log(`⚠️ [TAGOIO Cloud] Falha ao sincronizar dados. Código: ${response.status}`);
    }
  })
  .catch(err => {
    console.error("❌ [TAGOIO Cloud] Erro de conexão ao enviar:", err.message);
  });

  res.json({ success: true, message: 'Dados recebidos com sucesso', state: { smoke, alertaAtivo } });
});

// Rota para resetar histórico (útil para testes rápidos)
app.post('/api/reset', (req, res) => {
  readingsHistory = [];
  alertsHistory = [];
  ultimoEstadoAlerta = false;
  io.emit('resetData');
  res.json({ success: true, message: 'Dados limpos' });
});

// ==========================================
// Funções de Notificação (E-mail e SMS)
// ==========================================

async function enviarEmailAlerta(nivelFumaca, horario) {
  const dataFormatada = new Date(horario).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 2px solid #e74c3c; border-radius: 8px; background-color: #fdfefe;">
      <h2 style="color: #e74c3c; text-align: center; margin-top: 0; text-transform: uppercase;">⚠️ Alerta de Incêndio - Arcanjos ⚠️</h2>
      <hr style="border: 0; border-top: 1px solid #eee;">
      <p style="font-size: 16px;">O sensor de fumaça detectou uma anomalia grave no ambiente monitorado.</p>
      <div style="background-color: #fdedec; border-left: 5px solid #e74c3c; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0; font-size: 16px;"><strong>Status do Sistema:</strong> <span style="color: #e74c3c; font-weight: bold;">EMERGÊNCIA</span></p>
        <p style="margin: 5px 0; font-size: 16px;"><strong>Leitura do Sensor:</strong> <span style="font-weight: bold;">${nivelFumaca}</span> (Limite seguro: < ${alertConfig.threshold})</p>
        <p style="margin: 5px 0; font-size: 16px;"><strong>Horário do Disparo:</strong> ${dataFormatada}</p>
      </div>
      <p style="color: #555; font-size: 14px;"><em>Por favor, verifique o local imediatamente ou acione o corpo de bombeiros se necessário.</em></p>
      <hr style="border: 0; border-top: 1px solid #eee; margin-top: 30px;">
      <p style="font-size: 11px; color: #aaa; text-align: center;">Este é um alerta automático gerado pelo sistema IoT Arcanjos.</p>
    </div>
  `;

  try {
    if (!mailTransporter) {
      console.log('📧 Envio de e-mail cancelado: Transportador de e-mail não inicializado.');
      return;
    }

    let info = await mailTransporter.sendMail({
      from: '"Arcanjos IoT Alertas" <alerta.arcanjos@gmail.com>',
      to: alertConfig.email,
      subject: '⚠️ EMERGÊNCIA: Fumaça Detectada! [Arcanjos]',
      text: `EMERGÊNCIA: Fumaça detectada no nível ${nivelFumaca} às ${dataFormatada}. Verifique imediatamente!`,
      html: htmlBody
    });

    console.log(`📧 E-mail de alerta enviado para ${alertConfig.email}. MessageId: ${info.messageId}`);
    
    // Se for conta Ethereal, loga a URL de visualização
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      etherealUrl = previewUrl;
      console.log(`🔗 Ver e-mail de teste em: ${previewUrl}`);
      // Envia a URL do e-mail mockado para o dashboard exibir um link direto!
      io.emit('emailSentView', { url: previewUrl, email: alertConfig.email });
    }
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de alerta:', error);
  }
}

async function enviarEmailRecuperacao(nivelFumaca, horario) {
  const dataFormatada = new Date(horario).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 2px solid #2ecc71; border-radius: 8px; background-color: #fdfefe;">
      <h2 style="color: #2ecc71; text-align: center; margin-top: 0; text-transform: uppercase;">🟢 Ambiente Seguro - Arcanjos 🟢</h2>
      <hr style="border: 0; border-top: 1px solid #eee;">
      <p style="font-size: 16px;">O sistema Arcanjos detectou que o nível de fumaça retornou aos parâmetros seguros.</p>
      <div style="background-color: #eafaf1; border-left: 5px solid #2ecc71; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0; font-size: 16px;"><strong>Status do Sistema:</strong> <span style="color: #2ecc71; font-weight: bold;">SEGURO</span></p>
        <p style="margin: 5px 0; font-size: 16px;"><strong>Leitura Atual:</strong> <span style="font-weight: bold;">${nivelFumaca}</span> (Abaixo do limite: ${alertConfig.threshold})</p>
        <p style="margin: 5px 0; font-size: 16px;"><strong>Horário da Normalização:</strong> ${dataFormatada}</p>
      </div>
      <p style="color: #555; font-size: 14px;">O monitoramento contínuo permanece ativo.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin-top: 30px;">
      <p style="font-size: 11px; color: #aaa; text-align: center;">Este é um alerta automático gerado pelo sistema IoT Arcanjos.</p>
    </div>
  `;

  try {
    if (!mailTransporter) return;
    let info = await mailTransporter.sendMail({
      from: '"Arcanjos IoT Alertas" <alerta.arcanjos@gmail.com>',
      to: alertConfig.email,
      subject: '🟢 NORMALIZADO: Ambiente Seguro [Arcanjos]',
      text: `AMBIENTE SEGURO: Fumaça normalizada no nível ${nivelFumaca} às ${dataFormatada}.`,
      html: htmlBody
    });

    console.log(`📧 E-mail de normalização enviado para ${alertConfig.email}.`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      io.emit('emailSentView', { url: previewUrl, email: alertConfig.email, type: 'NORMAL' });
    }
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de normalização:', error);
  }
}

function enviarSMSAlerta(nivelFumaca) {
  const smsMessage = `🚨 ALERTA ARCANJOS: FUMACA DETECTADA! Nivel: ${nivelFumaca}. Verifique o local imediatamente!`;

  // Se o usuário configurou credenciais do Twilio no .env, tenta disparar real
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && alertConfig.phone) {
    console.log('📱 Enviando SMS real via Twilio...');
    const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    client.messages.create({
      body: smsMessage,
      from: process.env.TWILIO_FROM,
      to: alertConfig.phone
    })
    .then(message => console.log(`📱 SMS real enviado. SID: ${message.sid}`))
    .catch(err => console.error('❌ Erro no Twilio SMS:', err));
  } else {
    console.log(`📱 [SMS SIMULADO para ${alertConfig.phone}]: ${smsMessage}`);
  }

  // Sempre envia o evento de SMS simulado para a tela mostrar o popup
  io.emit('smsSentView', {
    phone: alertConfig.phone,
    message: smsMessage,
    type: 'ALERT',
    timestamp: new Date().toISOString()
  });
}

function enviarSMSRecuperacao(nivelFumaca) {
  const smsMessage = `🟢 ARCANJOS INFO: Ambiente normalizado. Fumaca em nivel seguro: ${nivelFumaca}.`;

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && alertConfig.phone) {
    const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    client.messages.create({
      body: smsMessage,
      from: process.env.TWILIO_FROM,
      to: alertConfig.phone
    })
    .then(message => console.log(`📱 SMS real de normalização enviado.`))
    .catch(err => console.error('❌ Erro no Twilio SMS:', err));
  } else {
    console.log(`📱 [SMS SIMULADO para ${alertConfig.phone}]: ${smsMessage}`);
  }

  io.emit('smsSentView', {
    phone: alertConfig.phone,
    message: smsMessage,
    type: 'NORMAL',
    timestamp: new Date().toISOString()
  });
}

// Socket.io Connection
io.on('connection', (socket) => {
  console.log(`🔌 Novo cliente conectado: ${socket.id}`);
  
  // Envia o estado e histórico inicial ao novo cliente
  socket.emit('initialData', {
    history: readingsHistory,
    config: alertConfig,
    alerts: alertsHistory
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id}`);
  });
});

// ==========================================
// Busca ativa (Polling) da Tago.IO
// ==========================================
let ultimoTimeProcessado = null;

async function buscarDadosTagoIO() {
  const tagoToken = "1590acd8-26a1-41b8-a5cb-da6f022c5872";
  try {
    const response = await fetch("https://api.tago.io/data?variable[]=smoke&variable[]=alertaAtivo&qty=2", {
      method: "GET",
      headers: {
        "Device-Token": tagoToken
      }
    });

    if (!response.ok) {
      // Silencia erros rotineiros de conexão ou limite de requisições se necessário, mas loga se falhar
      if (response.status !== 404) {
        console.log(`⚠️ [TagoIO Polling] Falha ao ler dados. Código: ${response.status}`);
      }
      return;
    }

    const resData = await response.json();
    if (resData.status && resData.result && resData.result.length > 0) {
      const smokeItem = resData.result.find(item => item.variable === 'smoke');
      const alertaItem = resData.result.find(item => item.variable === 'alertaAtivo');

      if (smokeItem) {
        const timestamp = smokeItem.time;

        // Processa apenas se for uma leitura nova baseada no timestamp
        if (timestamp !== ultimoTimeProcessado) {
          ultimoTimeProcessado = timestamp;

          const smoke = parseInt(smokeItem.value);
          const alertaAtivo = alertaItem 
            ? (parseInt(alertaItem.value) === 1 || alertaItem.value === 'true' || alertaItem.value === true) 
            : (smoke >= alertConfig.threshold);

          console.log(`📡 [TagoIO Polling] Nova leitura recebida da nuvem: Fumaça: ${smoke} PPM | Alerta: ${alertaAtivo}`);
          
          processarLeitura(smoke, alertaAtivo, timestamp);
        }
      }
    }
  } catch (err) {
    console.error("❌ [TagoIO Polling] Erro de conexão ao buscar dados:", err.message);
  }
}

// Inicia o polling a cada 2 segundos para manter o dashboard local atualizado
setInterval(buscarDadosTagoIO, 2000);

// Inicialização do servidor
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 ==================================================`);
  console.log(`🔥 PLATAFORMA IOT ARCANJOS ONLINE!`);
  console.log(`📱 App de Monitoramento Mobile: http://localhost:${PORT}`);
  console.log(`📡 API para Envio:              http://localhost:${PORT}/api/device/data`);
  console.log(`🚀 ==================================================\n`);
});
