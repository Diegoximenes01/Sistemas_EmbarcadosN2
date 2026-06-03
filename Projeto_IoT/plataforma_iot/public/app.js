// Conexão com o servidor Socket.io
const socket = io();

// Elementos do DOM
const connBadge = document.getElementById('connBadge');
const connText = document.getElementById('connText');
const statusCard = document.getElementById('statusCard');
const statusCircle = document.getElementById('statusCircle');
const statusIcon = document.getElementById('statusIcon');
const statusTitle = document.getElementById('statusTitle');
const statusDesc = document.getElementById('statusDesc');
const smokeValueEl = document.getElementById('smokeValue');
const lblThresholdEl = document.getElementById('lblThreshold');
const gaugeProgress = document.getElementById('gaugeProgress');
const configForm = document.getElementById('configForm');
const inputEmail = document.getElementById('inputEmail');
const inputPhone = document.getElementById('inputPhone');
const inputThreshold = document.getElementById('inputThreshold');
const logsContainer = document.getElementById('logsContainer');
const notificationsFeed = document.getElementById('notificationsFeed');
const btnResetData = document.getElementById('btnResetData');
const btnDownloadCSV = document.getElementById('btnDownloadCSV');
const smsSimulator = document.getElementById('smsSimulator');
const phoneChatBody = document.getElementById('phoneChatBody');
const toastContainer = document.getElementById('toastContainer');

// Dados locais
let smokeData = [];
let chartInstance = null;
let currentThreshold = 55;
let isFirstLoad = true;

// Inicializa o Gráfico de Linha Chart.js
function initChart() {
  const ctx = document.getElementById('realtimeChart').getContext('2d');
  
  // Gradiente de preenchimento abaixo da linha do gráfico
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
  gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Nível de Fumaça (PPM)',
        data: [],
        borderColor: '#6366f1',
        borderWidth: 3,
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#818cf8',
        pointBorderColor: '#0f172a',
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8' }
        },
        y: {
          min: 0,
          max: 100, // Ajusta dinamicamente se passar
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        }
      }
    }
  });
}

// Inicializa ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  
  // Listeners de Eventos do Usuário
  configForm.addEventListener('submit', salvarConfiguracoes);
  btnResetData.addEventListener('click', limparDadosServidor);
  btnDownloadCSV.addEventListener('click', exportarCSV);
});

// Atualiza o círculo e cor do medidor gauge
function atualizarGauge(valor, threshold) {
  // Circunferência do círculo é 2 * PI * R (2 * 3.1415 * 40 = ~251.2)
  const maxValor = 100;
  const porcentagem = Math.min(valor / maxValor, 1);
  const dashoffset = 251.2 - (251.2 * porcentagem);
  
  gaugeProgress.style.strokeDashoffset = dashoffset;
}

// Exibe notificações Toast na tela
function showToast(title, message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.innerHTML = `
    <span class="toast-icon">${isError ? '🚨' : '🔔'}</span>
    <div class="toast-content">
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;
  toastContainer.appendChild(toast);
  
  // Play soft chime sound
  playBeep(isError ? 400 : 700, 0.15);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-100%)';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// Mostra o Simulador de Smartphone com a mensagem SMS recebida
function showSMSOnPhone(phone, message, type) {
  // Play standard ringtone/receive chime
  playBeep(880, 0.1);
  setTimeout(() => playBeep(1320, 0.25), 100);

  // Insere bolha no chat do telefone
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const bubble = document.createElement('div');
  bubble.className = 'sms-bubble received';
  bubble.innerHTML = `
    ${message}
    <span class="sms-time">${timestamp}</span>
  `;
  phoneChatBody.appendChild(bubble);
  phoneChatBody.scrollTop = phoneChatBody.scrollHeight;

  // Atualiza hora do celular
  document.querySelector('.phone-time').innerText = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

  // Desliza telefone na tela
  smsSimulator.classList.add('active');
}

function closeSMSSimulator() {
  smsSimulator.classList.remove('active');
}

// Salva as configurações de e-mail, celular e limite crítico
function salvarConfiguracoes(e) {
  e.preventDefault();
  
  const payload = {
    email: inputEmail.value,
    phone: inputPhone.value,
    threshold: inputThreshold.value
  };

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showToast('Configurações Salvas', 'Os contatos de emergência foram atualizados com sucesso!');
    }
  })
  .catch(err => {
    console.error(err);
    showToast('Erro', 'Não foi possível salvar as configurações.', true);
  });
}

// Solicita limpeza dos dados ao servidor
function limparDadosServidor() {
  if (confirm('Tem certeza de que deseja limpar todo o histórico de leituras e alertas?')) {
    fetch('/api/reset', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast('Histórico Resetado', 'Todas as leituras e logs foram limpos com sucesso.');
      }
    });
  }
}

// Exporta as leituras salvas em formato CSV
function exportarCSV() {
  if (smokeData.length === 0) {
    alert('Nenhum dado disponível para exportar.');
    return;
  }

  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Timestamp,Nivel Fumaca (PPM),Alerta Ativo\n';

  smokeData.forEach(row => {
    csvContent += `"${row.timestamp}",${row.smoke},${row.alertaAtivo}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `relatorio_arcanjos_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Exportação concluída', 'Relatório CSV baixado com sucesso!');
}

// Atualiza a visualização do Dashboard com base na última leitura
function atualizarInterface(reading) {
  const { smoke, alertaAtivo, timestamp } = reading;
  
  // Atualiza o mostrador numérico
  smokeValueEl.innerText = smoke;
  atualizarGauge(smoke, currentThreshold);

  // Se o valor de fumaça superar o valor máximo do gráfico, atualiza o limite superior
  if (smoke > chartInstance.options.scales.y.max - 10) {
    chartInstance.options.scales.y.max = Math.ceil((smoke + 20) / 10) * 10;
  }

  // Adiciona ponto no gráfico
  const timeLabel = new Date(timestamp).toLocaleTimeString('pt-BR');
  chartInstance.data.labels.push(timeLabel);
  chartInstance.data.datasets[0].data.push(smoke);

  // Mantém apenas o limite de pontos no gráfico (últimos 20)
  if (chartInstance.data.labels.length > 20) {
    chartInstance.data.labels.shift();
    chartInstance.data.datasets[0].data.shift();
  }
  chartInstance.update();

  // Atualiza o estado da página dependendo do alerta
  if (alertaAtivo) {
    document.body.classList.add('alert-active');
    statusTitle.innerText = '🔴 EMERGÊNCIA!';
    statusIcon.innerText = '🔥';
    statusDesc.innerText = `Fumaça crítica detectada (${smoke} PPM). Sirenes e alertas ativados!`;
    startSiren(); // Inicia alarme sonoro
  } else {
    document.body.classList.remove('alert-active');
    statusTitle.innerText = '🟢 AMBIENTE SEGURO';
    statusIcon.innerText = '🛡️';
    statusDesc.innerText = `Nível de fumaça dentro dos limites de segurança (${smoke} PPM).`;
    stopSiren(); // Para alarme sonoro
  }

  // Adiciona ao início da lista de Logs
  adicionarItemLog(reading);
}

// Adiciona um item no contêiner de Logs históricos na tela
function adicionarItemLog(reading) {
  const { timestamp, smoke, alertaAtivo } = reading;
  const timeStr = new Date(timestamp).toLocaleTimeString('pt-BR');
  
  // Remove mensagem de "sem logs"
  const noLogsEl = logsContainer.querySelector('.no-logs');
  if (noLogsEl) noLogsEl.remove();

  const logItem = document.createElement('div');
  logItem.className = 'log-item';
  logItem.innerHTML = `
    <span class="log-time">${timeStr}</span>
    <span class="log-value ${alertaAtivo ? 'alert' : 'safe'}">${smoke} PPM</span>
    <span class="log-status" style="color: ${alertaAtivo ? 'var(--color-alert)' : 'var(--color-safe)'}">
      ${alertaAtivo ? '🔥 Alerta' : '🟢 Seguro'}
    </span>
  `;

  logsContainer.insertBefore(logItem, logsContainer.firstChild);

  // Limita número de elementos no DOM
  if (logsContainer.children.length > 50) {
    logsContainer.lastChild.remove();
  }
}

// ==========================================
// Handlers Socket.io
// ==========================================

// Conexão bem-sucedida
socket.on('connect', () => {
  connBadge.classList.add('connected');
  connText.innerText = 'Plataforma Conectada';
});

// Desconectado do servidor
socket.on('disconnect', () => {
  connBadge.classList.remove('connected');
  connText.innerText = 'Desconectado';
  stopSiren();
});

// Recebe dados iniciais ao se conectar
socket.on('initialData', (data) => {
  currentThreshold = data.config.threshold;
  lblThresholdEl.innerText = currentThreshold;
  
  // Seta valores nos inputs
  inputEmail.value = data.config.email;
  inputPhone.value = data.config.phone;
  inputThreshold.value = currentThreshold;

  // Carrega histórico
  smokeData = data.history;

  if (smokeData.length > 0) {
    logsContainer.innerHTML = '';
    
    // Injeta últimos dados no gráfico (máximo 20)
    const ultimosDados = smokeData.slice(-20);
    chartInstance.data.labels = ultimosDados.map(d => new Date(d.timestamp).toLocaleTimeString('pt-BR'));
    chartInstance.data.datasets[0].data = ultimosDados.map(d => d.smoke);
    chartInstance.update();

    // Adiciona todos os logs históricos na lista
    // Inverte para colocar os mais recentes no topo
    [...smokeData].reverse().forEach(reading => {
      adicionarItemLog(reading);
    });

    // Atualiza com o estado do último dado recebido
    atualizarInterface(smokeData[smokeData.length - 1]);
  } else {
    statusTitle.innerText = '🟢 AMBIENTE SEGURO';
    statusDesc.innerText = 'Aguardando leituras do sensor...';
  }

  // Adiciona alertas antigos ao feed de notificações
  if (data.alerts && data.alerts.length > 0) {
    notificationsFeed.innerHTML = '';
    data.alerts.forEach(alert => {
      adicionarNotificacaoAoFeed(alert);
    });
  }

  isFirstLoad = false;
});

// Recebe uma nova leitura em tempo real
socket.on('newReading', (reading) => {
  smokeData.push(reading);
  if (smokeData.length > MAX_READINGS) smokeData.shift();

  atualizarInterface(reading);
});

// Atualização de configurações vinda de outro cliente (ex: app mobile)
socket.on('configUpdated', (config) => {
  currentThreshold = config.threshold;
  lblThresholdEl.innerText = currentThreshold;
  inputEmail.value = config.email;
  inputPhone.value = config.phone;
  inputThreshold.value = currentThreshold;
  showToast('Configuração Sincronizada', 'As configurações foram atualizadas a partir de outro terminal.');
});

// Recebe disparo de alertas do sistema
socket.on('systemAlert', (alertEvent) => {
  const { type, message } = alertEvent;
  
  if (type === 'INCÊNDIO') {
    showToast('🚨 EMERGÊNCIA DETECTADA!', message, true);
  } else {
    showToast('🟢 AMBIENTE RECUPERADO', message, false);
  }
  
  adicionarNotificacaoAoFeed(alertEvent);
});

// Recebe e-mail enviado simulado/real para exibir no feed
socket.on('emailSentView', (data) => {
  const timeStr = new Date().toLocaleTimeString('pt-BR');
  const noLogsEl = notificationsFeed.querySelector('.no-logs');
  if (noLogsEl) noLogsEl.remove();

  const item = document.createElement('div');
  item.className = 'notification-item email';
  
  const isAlert = data.type !== 'NORMAL';
  
  item.innerHTML = `
    <div class="notification-header">
      <span>✉️ E-MAIL ENVIADO (${isAlert ? '🚨 ALERTA' : '🟢 INFO'})</span>
      <span>${timeStr}</span>
    </div>
    <p>Destinatário: <strong>${data.email}</strong></p>
    <p>Assunto: ${isAlert ? '⚠️ EMERGÊNCIA: Fumaça Detectada! [Arcanjos]' : '🟢 NORMALIZADO: Ambiente Seguro [Arcanjos]'}</p>
    <a href="${data.url}" target="_blank" class="notification-link">🔗 Visualizar E-mail Recebido no Inbox Virtual</a>
  `;

  notificationsFeed.insertBefore(item, notificationsFeed.firstChild);
  
  // Play email swish sound
  playBeep(900, 0.05);
  setTimeout(() => playBeep(1200, 0.1), 50);
});

// Recebe SMS enviado simulado/real para exibir no feed e no celular simulado
socket.on('smsSentView', (data) => {
  const timeStr = new Date(data.timestamp).toLocaleTimeString('pt-BR');
  const noLogsEl = notificationsFeed.querySelector('.no-logs');
  if (noLogsEl) noLogsEl.remove();

  // 1. Adiciona ao feed de notificações do dashboard
  const item = document.createElement('div');
  item.className = 'notification-item sms';
  item.innerHTML = `
    <div class="notification-header">
      <span>📱 SMS ENVIADO</span>
      <span>${timeStr}</span>
    </div>
    <p>Destinatário: <strong>${data.phone}</strong></p>
    <p>Mensagem: "${data.message}"</p>
  `;
  notificationsFeed.insertBefore(item, notificationsFeed.firstChild);

  // 2. Abre a notificação no smartphone simulado do lado direito
  showSMSOnPhone(data.phone, data.message, data.type);
});

// Recebe reset geral
socket.on('resetData', () => {
  smokeData = [];
  logsContainer.innerHTML = '<div class="no-logs">Nenhum evento registrado ainda.</div>';
  notificationsFeed.innerHTML = '<div class="no-logs">Nenhum e-mail ou SMS enviado neste ciclo.</div>';
  phoneChatBody.innerHTML = '';
  document.body.classList.remove('alert-active');
  stopSiren();
  
  // Limpa gráfico
  chartInstance.data.labels = [];
  chartInstance.data.datasets[0].data = [];
  chartInstance.update();

  statusTitle.innerText = '🟢 AMBIENTE SEGURO';
  statusDesc.innerText = 'Histórico limpo. Aguardando leituras...';
  smokeValueEl.innerText = '0';
  atualizarGauge(0, currentThreshold);
});

// Adiciona uma notificação (evento de alerta) ao feed visual
function adicionarNotificacaoAoFeed(alertEvent) {
  const noLogsEl = notificationsFeed.querySelector('.no-logs');
  if (noLogsEl) noLogsEl.remove();

  const timeStr = new Date(alertEvent.timestamp).toLocaleTimeString('pt-BR');
  const item = document.createElement('div');
  item.className = 'notification-item';
  item.style.borderLeftColor = alertEvent.type === 'INCÊNDIO' ? 'var(--color-alert)' : 'var(--color-safe)';
  item.style.background = alertEvent.type === 'INCÊNDIO' ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)';

  item.innerHTML = `
    <div class="notification-header">
      <span>🔔 ALERTA DE SISTEMA (${alertEvent.type})</span>
      <span>${timeStr}</span>
    </div>
    <p>${alertEvent.message}</p>
  `;

  notificationsFeed.insertBefore(item, notificationsFeed.firstChild);
}
