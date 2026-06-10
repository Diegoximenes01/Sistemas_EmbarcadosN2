/**
 * 🛡️ Arcanjos - Tinkercad Serial Bridge (Console Javascript F12)
 * 
 * Como usar:
 * 1. Abra o Tinkercad no Google Chrome ou Edge.
 * 2. Inicie a simulação do circuito e abra o "Código" -> "Monitor Serial" na parte inferior.
 * 3. Pressione F12 no seu teclado e clique na aba "Console".
 * 4. Cole este script completo e pressione ENTER.
 * 5. Veja as leituras do sensor do Tinkercad serem transmitidas automaticamente 
 *    para o servidor local e depois para o dashboard e TagoIO!
 */

(function() {
  console.clear();
  console.log("%c🛡️ ARCANJOS TINKERCAD BRIDGE INICIADA 🛡️", "color: #e74c3c; font-size: 16px; font-weight: bold;");
  console.log("Monitorando a saída do Monitor Serial do Tinkercad...");

  const SERVER_URL = "http://localhost:3000/api/device/data";
  let lastLineSent = "";

  // Função para encontrar a saída de texto do monitor serial no DOM do Tinkercad
  function getSerialContent() {
    // Tinkercad usa elementos com classes que contêm 'serial-monitor' ou textareas do editor de código
    const selectors = [
      '.serial-monitor-content',
      '.code_panel__serial_monitor__output',
      'textarea.code-view-serial',
      '.serial_monitor_output',
      'div[class*="serial-monitor"]',
      'textarea[class*="serial"]'
    ];

    for (let selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        return el.value || el.innerText || "";
      }
    }

    // Fallback: Procura por qualquer textarea ou pre que pareça o monitor serial
    const elements = document.querySelectorAll('textarea, pre, div');
    for (let el of elements) {
      const text = el.placeholder || el.className || "";
      if (text.toLowerCase().includes("serial") && text.toLowerCase().includes("monitor")) {
        return el.value || el.innerText || "";
      }
      if (el.value && el.value.includes('"smoke"')) {
        return el.value;
      }
      if (el.innerText && el.innerText.includes('"smoke"')) {
        return el.innerText;
      }
    }
    return "";
  }

  // Loop de monitoramento periódico (executado a cada 1 segundo)
  const monitorInterval = setInterval(() => {
    const content = getSerialContent();
    if (!content) {
      console.warn("⚠️ [Tinkercad Bridge] Monitor Serial não encontrado. Certifique-se de que a aba 'Código' e o 'Monitor Serial' estão abertos na tela!");
      return;
    }

    // Divide em linhas e pega a última linha não-vazia
    const lines = content.trim().split("\n");
    const newestLine = lines[lines.length - 1].trim();

    if (newestLine && newestLine !== lastLineSent) {
      lastLineSent = newestLine;
      console.log(`[SERIAL LIDO] -> ${newestLine}`);

      // Tenta decodificar o JSON e enviar para o servidor local
      try {
        const payload = JSON.parse(newestLine);
        
        if (payload.smoke !== undefined) {
          fetch(SERVER_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          })
          .then(async response => {
            const data = await response.json();
            if (response.ok) {
              console.log(`%c   📡 HTTP OK: Enviado ao App -> Fumaça: ${payload.smoke} PPM | Alerta: ${payload.alertaAtivo}`, "color: #2ecc71;");
            } else {
              console.error(`   ❌ HTTP Erro: ${response.status} |`, data);
            }
          })
          .catch(err => {
            console.error("   ❌ Erro de conexão com o servidor local (certifique-se de que o backend está rodando na porta 3000):", err.message);
          });
        }
      } catch (e) {
        // Ignora linhas que não são JSON válido (ex: textos de inicialização)
        console.log(`[LOG COMUM] ${newestLine}`);
      }
    }
  }, 1000);

  // Expõe função de parada caso o usuário queira desativar
  window.stopArcanjosBridge = function() {
    clearInterval(monitorInterval);
    console.log("🛑 Ponte Arcanjos desativada.");
  };

  console.log("💡 Dica: Se quiser parar a ponte a qualquer momento, digite 'stopArcanjosBridge()' no console.");
})();
