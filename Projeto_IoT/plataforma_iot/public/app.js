// Conectando com o servidor Socket.io
const socket = io();

// Elementos da Interface Mobile
const mobileConnStatus = document.getElementById('mobileConnStatus');
const mobileSmokeVal = document.getElementById('mobileSmokeVal');
const mobileGaugeInner = document.getElementById('mobileGaugeInner');
const mobileStatusCard = document.getElementById('mobileStatusCard');
const mobileStatusIcon = document.getElementById('mobileStatusIcon');
const mobileStatusTitle = document.getElementById('mobileStatusTitle');
const mobileStatusDesc = document.getElementById('mobileStatusDesc');
const lblMobileThreshold = document.getElementById('lblMobileThreshold');
const lblLastAlertTime = document.getElementById('lblLastAlertTime');

const lblAvgSmoke = document.getElementById('lblAvgSmoke');
const lblMaxSmoke = document.getElementById('lblMaxSmoke');
const mobileLogsList = document.getElementById('mobileLogsList');

const mobileConfigForm = document.getElementById('mobileConfigForm');
const mInputEmail = document.getElementById('mInputEmail');
const mInputPhone = document.getElementById('mInputPhone');
const mInputThreshold = document.getElementById('mInputThreshold');

const mobileToastContainer = document.getElementById('mobileToastContainer');

// Botões de Teste do Simulador
const btnTestSafe = document.getElementById('btnTestSafe');
const btnTestFire = document.getElementById('btnTestFire');
const btnMobileCSV = document.getElementById('btnMobileCSV');

// Navegação por Abas
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Variáveis de Controle local
let mobileReadings = [];
let localThreshold = 55;

// Configuração da Navegação
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetTab = item.getAttribute('data-tab');
    
    // Altera classe ativa do botão
    navItems.forEach(btn => btn.classList.remove('active'));
    item.classList.add('active');
    
    // Altera aba visível
    tabContents.forEach(tab => {
      tab.classList.remove('active');
      if (tab.id === targetTab) {
        tab.classList.add('active');
      }
    });

    playMobileBeep(900, 0.03); // Feedback táctil sonoro
  });
});

// Toast Mobile
function showMobileToast(title, message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `m-toast ${isError ? 'error' : ''}`;
  toast.innerHTML = `
    <span>${isError ? '🚨' : '🔔'}</span>
    <div>
      <strong>${title}</strong>: ${message}
    </div>
  `;
  mobileToastContainer.appendChild(toast);
  playMobileBeep(isError ? 450 : 800, 0.1);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Inicialização ao carregar
document.addEventListener('DOMContentLoaded', () => {
  mobileConfigForm.addEventListener('submit', salvarConfiguracoesMobile);
  btnTestSafe.addEventListener('click', () => simularDispositivo(20));
  btnTestFire.addEventListener('click', () => simularDispositivo(85));
  btnMobileCSV.addEventListener('click', exportarCSVMobile);
  
  // Atualizar relógio simulado
  setInterval(() => {
    const timeFake = document.querySelector('.time-fake');
    if (timeFake) {
      timeFake.innerText = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    }
  }, 1000);
});

// Envia dados simulados do sensor para o Servidor via HTTP POST
function simularDispositivo(valorSmoke) {
  const payload = {
    smoke: valorSmoke,
    alertaAtivo: valorSmoke >= localThreshold
  };

  fetch('/api/device/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    showMobileToast('Comando Enviado', `Simulação enviada com sucesso: ${valorSmoke} PPM`);
  })
  .catch(err => {
    console.error(err);
    showMobileToast('Erro', 'Erro ao enviar simulação', true);
  });
}

// Salva as configurações de contato
function salvarConfiguracoesMobile(e) {
  e.preventDefault();

  const payload = {
    email: mInputEmail.value,
    phone: mInputPhone.value,
    threshold: mInputThreshold.value
  };

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showMobileToast('Ajustado', 'Configurações de alerta salvas!');
    }
  })
  .catch(err => {
    console.error(err);
    showMobileToast('Erro', 'Não foi possível salvar', true);
  });
}

// Atualiza telas de Relatórios
function recalcularRelatorios() {
  if (mobileReadings.length === 0) {
    lblAvgSmoke.innerText = '0 PPM';
    lblMaxSmoke.innerText = '0 PPM';
    return;
  }

  const soma = mobileReadings.reduce((acc, curr) => acc + curr.smoke, 0);
  const media = Math.round(soma / mobileReadings.length);
  const maximo = Math.max(...mobileReadings.map(r => r.smoke));

  lblAvgSmoke.innerText = `${media} PPM`;
  lblMaxSmoke.innerText = `${maximo} PPM`;
}

// Injeta linha de log no histórico do celular
function adicionarLinhaLogMobile(reading, insertAtTop = true) {
  const noLogsEl = mobileLogsList.querySelector('.no-logs');
  if (noLogsEl) noLogsEl.remove();

  const row = document.createElement('div');
  row.className = 'mobile-log-row';
  
  const timeStr = new Date(reading.timestamp).toLocaleTimeString('pt-BR');
  
  row.innerHTML = `
    <span class="time">${timeStr}</span>
    <span class="val ${reading.alertaAtivo ? 'alert' : ''}">${reading.smoke} PPM</span>
    <span class="status" style="color: ${reading.alertaAtivo ? 'var(--m-color-alert)' : 'var(--m-color-safe)'}">
      ${reading.alertaAtivo ? '⚠️ Alerta' : '🟢 Seguro'}
    </span>
  `;

  if (insertAtTop) {
    mobileLogsList.insertBefore(row, mobileLogsList.firstChild);
  } else {
    mobileLogsList.appendChild(row);
  }

  if (mobileLogsList.children.length > 50) {
    mobileLogsList.lastChild.remove();
  }
}

// Exportar CSV
function exportarCSVMobile() {
  if (mobileReadings.length === 0) {
    alert('Sem dados.');
    return;
  }
  let csvContent = 'data:text/csv;charset=utf-8,Timestamp,Fumaca(PPM),Alerta\n';
  mobileReadings.forEach(r => {
    csvContent += `"${r.timestamp}",${r.smoke},${r.alertaAtivo}\n`;
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `mobile_relatorio_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Variáveis para controle da Sirene no Web Audio API
let sirenOscillator = null;
let sirenGain = null;
let isSirenPlaying = false;

// Função para iniciar a Sirene com frequência oscilante (efeito de emergência)
function startMobileSiren() {
  if (isSirenPlaying) return;

  // Garante que o AudioContext do index.html seja instanciado
  if (!mobileAudioCtx) {
    mobileAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (mobileAudioCtx.state === 'suspended') {
    console.log("AudioContext suspenso. Aguardando interação do usuário para reproduzir som.");
    return;
  }

  try {
    isSirenPlaying = true;
    sirenOscillator = mobileAudioCtx.createOscillator();
    sirenGain = mobileAudioCtx.createGain();

    // Tipo 'sawtooth' para tom estridente de alarme
    sirenOscillator.type = 'sawtooth';
    sirenOscillator.frequency.setValueAtTime(500, mobileAudioCtx.currentTime);

    // Oscilador de baixa frequência (LFO) para fazer a frequência subir e descer (efeito sirene)
    const lfo = mobileAudioCtx.createOscillator();
    const lfoGain = mobileAudioCtx.createGain();

    lfo.frequency.value = 1.5; // Velocidade da oscilação (1.5 Hz)
    lfoGain.gain.value = 250; // Variação de frequência (+/- 250 Hz)

    lfo.connect(lfoGain);
    lfoGain.connect(sirenOscillator.frequency);

    // Controle de volume
    sirenGain.gain.setValueAtTime(0.1, mobileAudioCtx.currentTime);

    sirenOscillator.connect(sirenGain);
    sirenGain.connect(mobileAudioCtx.destination);

    lfo.start();
    sirenOscillator.start();

    // Vincula o LFO ao oscilador principal para conseguirmos pará-lo depois
    sirenOscillator.lfo = lfo;
  } catch (error) {
    console.error("Falha ao iniciar sirene:", error);
    isSirenPlaying = false;
  }
}

// Função para parar a Sirene
function stopMobileSiren() {
  if (!isSirenPlaying) return;
  isSirenPlaying = false;

  try {
    if (sirenOscillator) {
      sirenOscillator.stop();
      if (sirenOscillator.lfo) {
        sirenOscillator.lfo.stop();
      }
      sirenOscillator = null;
    }
  } catch (error) {
    console.error("Falha ao parar sirene:", error);
  }
}

// Evento global para destravar o áudio no primeiro clique do usuário caso já esteja em alarme
document.addEventListener('click', () => {
  if (mobileAudioCtx && mobileAudioCtx.state === 'suspended') {
    mobileAudioCtx.resume().then(() => {
      if (document.body.classList.contains('m-alert-active')) {
        startMobileSiren();
      }
    });
  }
}, { once: false });

// Atualiza a UI do Painel Principal
function atualizarPainelMobile(reading) {
  const { smoke, alertaAtivo } = reading;

  mobileSmokeVal.innerText = smoke;

  if (alertaAtivo) {
    document.body.classList.add('m-alert-active');
    mobileStatusIcon.innerText = '🔥';
    mobileStatusTitle.innerText = 'Fumaça Crítica!';
    mobileStatusDesc.innerText = 'Risco iminente. Evacue a área!';
    
    // Dispara a sirene de alerta
    startMobileSiren();

    // Tenta vibrar celular real se disponível
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 100, 300, 100, 300]);
    }
  } else {
    document.body.classList.remove('m-alert-active');
    mobileStatusIcon.innerText = '🟢';
    mobileStatusTitle.innerText = 'Ambiente Seguro';
    mobileStatusDesc.innerText = 'Todas as condições estão normais.';
    
    // Para a sirene
    stopMobileSiren();
  }
}

// ==========================================
// WebSockets Eventos
// ==========================================

socket.on('connect', () => {
  mobileConnStatus.classList.add('connected');
});

socket.on('disconnect', () => {
  mobileConnStatus.classList.remove('connected');
  document.body.classList.remove('m-alert-active');
});

socket.on('initialData', (data) => {
  localThreshold = data.config.threshold;
  lblMobileThreshold.innerText = `${localThreshold} PPM`;

  // Preenche inputs do form
  mInputEmail.value = data.config.email;
  mInputPhone.value = data.config.phone;
  mInputThreshold.value = localThreshold;

  mobileReadings = data.history;
  
  if (mobileReadings.length > 0) {
    mobileLogsList.innerHTML = '';
    
    // Preenche lista de relatórios
    mobileReadings.forEach(reading => {
      adicionarLinhaLogMobile(reading, false);
    });

    const lastReading = mobileReadings[mobileReadings.length - 1];
    atualizarPainelMobile(lastReading);
    recalcularRelatorios();

    // Encontra o horário do último alerta
    const logsAlerta = mobileReadings.filter(r => r.alertaAtivo);
    if (logsAlerta.length > 0) {
      const lastAlertTimeStr = new Date(logsAlerta[logsAlerta.length - 1].timestamp).toLocaleTimeString('pt-BR');
      lblLastAlertTime.innerText = lastAlertTimeStr;
    }
  }
});

socket.on('newReading', (reading) => {
  mobileReadings.push(reading);
  if (mobileReadings.length > 100) mobileReadings.shift();

  atualizarPainelMobile(reading);
  adicionarLinhaLogMobile(reading, true);
  recalcularRelatorios();
});

socket.on('configUpdated', (config) => {
  localThreshold = config.threshold;
  lblMobileThreshold.innerText = `${localThreshold} PPM`;
  mInputEmail.value = config.email;
  mInputPhone.value = config.phone;
  mInputThreshold.value = localThreshold;
  showMobileToast('Parâmetros Atualizados', 'Sincronizado com a plataforma.');
});

socket.on('systemAlert', (alertEvent) => {
  if (alertEvent.type === 'INCÊNDIO') {
    lblLastAlertTime.innerText = new Date(alertEvent.timestamp).toLocaleTimeString('pt-BR');
    showMobileToast('🚨 EMERGÊNCIA 🚨', alertEvent.message, true);
  } else {
    showMobileToast('🟢 RETORNO SEGURO', 'O ambiente normalizou.', false);
  }
});

socket.on('resetData', () => {
  mobileReadings = [];
  mobileLogsList.innerHTML = '<div class="no-logs">Nenhuma leitura gravada ainda.</div>';
  lblAvgSmoke.innerText = '0 PPM';
  lblMaxSmoke.innerText = '0 PPM';
  lblLastAlertTime.innerText = 'Nenhum';
  mobileSmokeVal.innerText = '0';
  document.body.classList.remove('m-alert-active');
  
  mobileStatusIcon.innerText = '🟢';
  mobileStatusTitle.innerText = 'Ambiente Seguro';
  mobileStatusDesc.innerText = 'Histórico limpo. Aguardando...';

  // Garante que a sirene pare
  stopMobileSiren();
});
