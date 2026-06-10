/**
 * 🛡️ Arcanjos - Tinkercad Serial Bridge to Tago.IO (Console Javascript F12)
 * 
 * Como funciona este fluxo:
 * 1. O Arduino no Tinkercad imprime o JSON serial: {"smoke": 45, "alertaAtivo": false}
 * 2. Este script roda no console do Tinkercad e envia os dados DIRETAMENTE para a Tago.IO (POST).
 * 3. O servidor local Node.js faz a busca ativa (polling) na Tago.IO e atualiza o App Mobile via WebSockets.
 * 
 * Como usar:
 * 1. Abra o Tinkercad no Google Chrome ou Edge.
 * 2. Inicie a simulação do circuito e abra o "Código" -> "Monitor Serial" na parte inferior.
 * 3. Pressione F12 no seu teclado e clique na aba "Console".
 * 4. Cole este script completo e pressione ENTER.
 */

(function() {
  console.clear();
  console.log("%c🛡️ ARCANJOS TINKERCAD ➔ TAGO.IO BRIDGE INICIADA 🛡️", "color: #e74c3c; font-size: 16px; font-weight: bold;");
  console.log("Monitorando e enviando dados diretamente para o Tago.IO...");

  const TAGO_URL = "https://api.tago.io/data";
  const TAGO_TOKEN = "1590acd8-26a1-41b8-a5cb-da6f022c5872";
  let lastLineSent = "";

  // Função para encontrar a saída de texto do monitor serial no DOM do Tinkercad
  function getSerialContent() {
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

      // Tenta decodificar o JSON e enviar para a Tago.IO
      try {
        const payload = JSON.parse(newestLine);
        
        if (payload.smoke !== undefined) {
          // Formata payload no padrão exigido pela API da Tago.IO
          const tagoPayload = [
            { "variable": "smoke", "value": parseInt(payload.smoke) },
            { "variable": "alertaAtivo", "value": payload.alertaAtivo ? 1 : 0 }
          ];

          fetch(TAGO_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": TAGO_TOKEN
            },
            body: JSON.stringify(tagoPayload)
          })
          .then(async response => {
            if (response.ok) {
              console.log(`%c   📡 TAGO.IO OK: Enviado -> Fumaça: ${payload.smoke} PPM | Alerta: ${payload.alertaAtivo}`, "color: #2ecc71;");
            } else {
              const errText = await response.text();
              console.error(`   ❌ TAGO.IO Erro: ${response.status} |`, errText);
            }
          })
          .catch(err => {
            console.error("   ❌ Erro de rede ao enviar para a Tago.IO:", err.message);
          });
        }
      } catch (e) {
        // Ignora linhas que não são JSON válido (ex: textos de inicialização do Arduino)
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
