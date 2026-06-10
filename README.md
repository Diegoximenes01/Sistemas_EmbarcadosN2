# 🛡️ Arcanjos - Sistema IoT de Detecção de Incêndio e Alerta

Este repositório contém o projeto de **Sistemas Embarcados e IoT** desenvolvido para a **Arcanjos**, um sistema de segurança residencial e industrial focado na detecção precoce de fumaça, sinalização local de emergência e alertas automáticos e síncronos via web, e-mail e SMS. 

O projeto apresenta uma solução que integra circuitos analógicos de hardware, firmwares com lógica de histerese, pontes de comunicação serial, nuvem IoT e um aplicativo móvel de monitoramento em tempo real.

---

## 👥 Equipe de Desenvolvimento
* **Diego Ximenes**
* **Luiz Eduardo**

---

## 📐 Fluxo de Comunicação do Sistema

O fluxo de dados é direto e estruturado da seguinte forma:
1. **Captura:** O microcontrolador (ESP32 via WiFi ou Arduino Uno via Cabo Serial) lê o sensor de fumaça MQ-2.
2. **Processamento Local:** Os dados são enviados (via requisição HTTP POST) para o nosso Servidor backend local (Node.js).
3. **Atualização em Tempo Real:** O servidor local atualiza instantaneamente a tela do nosso aplicativo móvel (**Arcanjos Mobile**) via WebSockets.
4. **Nuvem e Notificações (TagoIO):** O servidor também repassa a leitura em tempo real para a nuvem da TagoIO, que fica responsável por gerenciar o histórico e realizar os disparos de alertas externos por SMS.

---

## 🔌 Implementação de Hardware e Sensores

O projeto foi projetado para rodar tanto em ambiente simulado quanto físico, utilizando componentes comuns de mercado:

* **Microcontrolador Principal:** Arduino Uno R3 ou NodeMCU ESP32.
* **Sensor de Gás/Fumaça (MQ-2):** Realiza a leitura analógica da concentração de fumaça no ar (medida em PPM).
* **Indicadores Visuais:** LED Verde (ativado em condições seguras) e LED Vermelho (ativado em emergência).
* **Alarme Sonoro:** Buzzer piezoelétrico configurado para emitir frequências oscilantes de sirene em caso de sinistro.
* **Display:** LCD 16x2 com driver padrão de pinos.

---

## 💻 Desenvolvimento de Software e Protocolos

A solução de software foi dividida em camadas focadas em modularidade e robustez:

### 1. Camada de Firmware (C++)
* **arduino_serial.ino:** Desenvolvido para Arduino Uno. Realiza a leitura analógica do MQ-2, gerencia os atuadores físicos (LCD, LEDs, Buzzer) e empacota os dados estruturados em **JSON** enviados via Porta Serial USB.
* **esp32_sensor.ino:** Desenvolvido para ESP32. Além do controle local dos sensores e atuadores, utiliza a biblioteca HTTPClient para enviar os dados diretamente via **WiFi (HTTP POST)** para o backend local e para a plataforma TagoIO.

### 2. Camada de Integração e Simulação (Python)
* **serial_bridge.py:** Script que detecta e lê a porta COM ativa, captura as mensagens JSON enviadas pelo Arduino e as converte em requisições de rede (HTTP POST) destinadas ao servidor local.
* **emulator.py:** Emulador de hardware interativo via terminal. Permite simular o sensor e gerar picos/dissipações de fumaça usando teclas de atalho (`A`/`S`), enviando os payloads para o servidor local ou TagoIO.

### 3. Camada do Servidor Backend (Node.js e Express)
* **API REST:** Rotas para recepção de dados (`/api/device/data`) e gerenciamento dinâmico de parâmetros de configuração (`/api/config`).
* **Sincronização em Tempo Real:** Conexões **WebSocket (Socket.io)** bi-direcionais que distribuem instantaneamente as atualizações recebidas para todos os painéis web conectados.
* **Notificação Multicanal:** Dispara automaticamente e-mails com layout de emergência vermelho (via **Nodemailer/Ethereal**) e simula/envia mensagens SMS (via **Twilio**) quando ocorre a transição para o estado de incêndio.

### 4. Camada de Interface do Usuário (Web App Mobile)
* **Web App Mobile:** É a interface principal do sistema, hospedada diretamente na raiz do servidor local (`/`). Desenvolvida com HTML5/CSS3/JS puro e design responsivo otimizado para celulares. Ela exibe em tempo real a leitura atual do sensor em um gauge interativo, calcula estatísticas dinâmicas (média e máxima), lista o histórico de logs, e permite ao usuário exportar os dados para **CSV**. O app também permite configurar o e-mail/telefone de alertas, simular fumaça, e aciona a Web Audio API (sirene) e a Vibration API (`navigator.vibrate`) no celular durante emergências.

### 5. Nuvem IoT (TagoIO)
* Armazenamento secundário do histórico de leituras.
* **Ações em Nuvem:** Envio automático de SMS para os destinatários cadastrados. A ação de alerta foi configurada com lógica de histerese na nuvem (**Trigger Unlock**), disparando o SMS apenas na transição do alerta e rearmando quando a fumaça normaliza (cai abaixo de 40 PPM), o que otimiza o uso do limite de mensagens da conta.

---

## 🧠 Lógica de Controle do Alerta (Histerese)

Para evitar disparos falsos e oscilações constantes nos alarmes (LEDs, Buzzer e status do app) quando o valor do sensor flutua próximo ao limite, o firmware utiliza o conceito de **histerese**:
* **Ativação do Alerta:** O alarme e os alertas visuais só são ativados quando o nível de fumaça atinge ou ultrapassa **55 PPM**.
* **Desativação do Alerta (Retorno ao normal):** O alarme só cessa e o sistema volta para o modo "ambiente seguro" quando a fumaça dissipa e atinge valores iguais ou inferiores a **40 PPM**.

---

## 📂 Estrutura do Repositório

```text
N2/
├── Projeto_IoT/
│   ├── Circuito.png                 # Esquema elétrico do circuito físico
│   ├── dispositivo_iot/             # Código dos dispositivos e simuladores
│   │   ├── arduino_serial/          # Firmware em C++ para Arduino Uno
│   │   ├── esp32_sensor/            # Firmware em C++ para ESP32
│   │   ├── emulator.py              # Emulador interativo do sensor em Python
│   │   └── serial_bridge.py         # Ponte de comunicação Serial-HTTP
│   └── plataforma_iot/              # Servidor Web backend (Node.js)
│       ├── server.js                # Lógica do backend, WebSockets e notificações
│       └── public/                  # Frontend do Aplicativo Móvel
│           ├── index.html           # Tela principal do aplicativo
│           ├── style.css            # Estilização visual (CSS responsivo)
│           └── app.js               # Conexão WebSocket e controle da interface
└── README.md                        # Documentação técnica unificada do projeto
```
